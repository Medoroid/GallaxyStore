import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-errors";
import {
  isMissingRelation,
  migrationRequiredResponse,
  requireUser,
} from "@/lib/creator/api";
import { migrationGuard, prepareArtwork, readUpload } from "@/lib/design-studio/server";
import { mockupConfigHash } from "@/lib/design-studio/mockup-hash";
import { mockupStoragePath } from "@/lib/design-studio/mockup";
import { getColor, getTemplate, getView } from "@/lib/design-studio/templates";
import { resolveTemplateForProduct } from "@/lib/design-studio/template-catalog";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public-read previews bucket (plan D7: originals stay in design-uploads). */
const PREVIEW_BUCKET = "design-previews";

/**
 * POST — store one generated mockup PNG for (design × template × view × color).
 *
 * Protocol (Phase 5):
 *  - multipart `file` (the PNG the client rendered) + `config` (JSON string);
 *  - the SERVER recomputes config_hash from the validated, normalized config,
 *    so client and server can never disagree about the idempotency key;
 *  - template/view/color are validated against the pure registry, transform/
 *    area must be finite, and config.fileId must be the design's CURRENT
 *    artwork file (409 stale_artwork otherwise — never persist a preview of
 *    replaced artwork);
 *  - an existing record with the same hash short-circuits with `cached:true`
 *    and NO upload;
 *  - writes go through the service role: `design-previews` INSERT is
 *    admin-only under RLS and the four studio tables are SELECT-only for
 *    owners. Ownership is proven BEFORE any of that with the caller's own
 *    JWT (design + profile), so no client-supplied id is ever trusted.
 */
export async function POST(request, { params }) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`design-mockup:${ip}`, {
      maxRequests: 10,
      failureMode: "fail_closed",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(String(id))) {
      return Response.json(
        { success: false, code: "not_found", message: "Design not found." },
        { status: 404 }
      );
    }

    // creator_design_products lives in the studio migration — honest 503
    // BEFORE reading the body or touching Storage.
    const guard = await migrationGuard(auth.client, "designs.mockups");
    if (guard.missing) return guard.response;

    const upload = await readUpload(request, "file");
    if (!upload.ok) return upload.response;

    const validated = await validateConfig(upload.form);
    if (!validated.ok) return validated.response;
    const config = validated.config;

    const prepared = prepareArtwork(upload.bytes, {
      filename: upload.file.name,
      mimeType: upload.file.type,
    });
    if (!prepared.ok) return uploadFailureResponse(prepared);
    if (prepared.format !== "png") {
      return Response.json(
        {
          success: false,
          code: "unsupported_type",
          message: "Generated previews must be PNG images.",
        },
        { status: 400 }
      );
    }

    // Owner-scoped design load: current version + its artwork file.
    const { data: design, error: designError } = await auth.client
      .from("user_designs")
      .select("id, design_versions!inner(id, design_files(id, is_primary))")
      .eq("id", id)
      .eq("owner_id", auth.user.id)
      .is("deleted_at", null)
      .eq("design_versions.is_current", true)
      .maybeSingle();
    if (designError) throw designError;
    if (!design) {
      return Response.json(
        { success: false, code: "not_found", message: "Design not found." },
        { status: 404 }
      );
    }

    const files = design.design_versions?.[0]?.design_files ?? [];
    const currentFile = files.find((file) => file.is_primary) ?? files[0] ?? null;
    if (!currentFile) {
      return Response.json(
        {
          success: false,
          code: "no_artwork",
          message: "Add artwork to this design before generating product previews.",
        },
        { status: 409 }
      );
    }
    if (currentFile.id !== config.fileId) {
      return Response.json(
        {
          success: false,
          code: "stale_artwork",
          message: "The artwork changed — regenerate the preview.",
        },
        { status: 409 }
      );
    }

    // Persona is public by design; we only read our own profile id from it.
    const { data: profile, error: profileError } = await auth.client
      .from("creator_profiles")
      .select("id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (profileError) {
      if (isMissingRelation(profileError)) {
        return migrationRequiredResponse("designs.mockups");
      }
      throw profileError;
    }
    if (!profile) {
      return Response.json(
        {
          success: false,
          code: "creator_profile_required",
          message: "Create your creator profile to generate product previews.",
        },
        { status: 403 }
      );
    }

    // Published geometry is the single source of truth: re-validate view and
    // colour against the DB snapshot now that authorization is complete.
    let published = null;
    try {
      published = await resolveTemplateForProduct(config.template);
    } catch {
      published = null; // registry validation above remains authoritative
    }
    if (!published) {
      return Response.json(
        { success: false, code: "unknown_template", message: "Unknown product template." },
        { status: 400 }
      );
    }
    if (!getView(published.template, config.view)) {
      return Response.json(
        { success: false, code: "unknown_view", message: "Unknown product view." },
        { status: 400 }
      );
    }
    if (!getColor(published.template, config.color)) {
      return Response.json(
        { success: false, code: "unknown_color", message: "Unknown product color." },
        { status: 400 }
      );
    }

    const configHash = mockupConfigHash(config);
    const path = mockupStoragePath(id, config.template, config.view, config.color, configHash);

    // ----- service-role section: catalog + row + bucket (never trusted) -----
    const admin = getServiceRoleClient();

    const { data: catalogRow, error: catalogError } = await admin
      .from("creator_product_templates")
      .select("id")
      .eq("template_key", config.template)
      .maybeSingle();
    if (catalogError) {
      if (isMissingRelation(catalogError)) {
        return migrationRequiredResponse("designs.mockups");
      }
      throw catalogError;
    }
    if (!catalogRow) {
      return Response.json(
        {
          success: false,
          code: "templates_not_seeded",
          message: "Product templates are not seeded yet. Apply the template seed migration.",
        },
        { status: 503 }
      );
    }

    const { data: productRow, error: rowError } = await admin
      .from("creator_design_products")
      .select("id, mockups")
      .eq("design_id", id)
      .eq("template_id", catalogRow.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (rowError) {
      if (isMissingRelation(rowError)) {
        return migrationRequiredResponse("designs.mockups");
      }
      throw rowError;
    }

    // Idempotency: identical config already stored → no upload, no write.
    const mockups = Array.isArray(productRow?.mockups) ? productRow.mockups : [];
    const cached = mockups.find(
      (record) => record && record.config_hash === configHash
    );
    if (cached) {
      return Response.json({ success: true, cached: true, mockup: cached });
    }

    const { error: storageError } = await admin.storage
      .from(PREVIEW_BUCKET)
      .upload(path, Buffer.from(prepared.storeBytes), {
        contentType: "image/png",
        upsert: true,
      });
    if (storageError) {
      return Response.json(
        {
          success: false,
          code: "storage_rejected",
          message: "Could not store the generated preview.",
        },
        { status: 400 }
      );
    }

    const record = {
      view: config.view,
      color: config.color,
      path,
      width: prepared.widthPx,
      height: prepared.heightPx,
      config_hash: configHash,
      generated_at: new Date().toISOString(),
    };

    try {
      if (productRow) {
        const { error: updateError } = await admin
          .from("creator_design_products")
          .update({ mockups: [...mockups, record] })
          .eq("id", productRow.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await admin
          .from("creator_design_products")
          .insert({
            design_id: id,
            template_id: catalogRow.id,
            creator_profile_id: profile.id,
            mockups: [record],
          });
        if (insertError) {
          if (insertError.code === "23505") {
            // Lost a race for the design×template row — append to the winner.
            const { data: raced, error: raceReadError } = await admin
              .from("creator_design_products")
              .select("id, mockups")
              .eq("design_id", id)
              .eq("template_id", catalogRow.id)
              .is("deleted_at", null)
              .maybeSingle();
            if (raceReadError) throw raceReadError;
            if (raced) {
              const { error: appendError } = await admin
                .from("creator_design_products")
                .update({
                  mockups: [
                    ...(Array.isArray(raced.mockups) ? raced.mockups : []),
                    record,
                  ],
                })
                .eq("id", raced.id);
              if (!appendError) {
                return Response.json({ success: true, mockup: record }, { status: 201 });
              }
              throw appendError;
            }
          }
          throw insertError;
        }
      }
    } catch (dbError) {
      // Never leave an orphan object behind a failed persist.
      try {
        await admin.storage.from(PREVIEW_BUCKET).remove([path]);
      } catch {
        /* best effort */
      }
      throw dbError;
    }

    return Response.json({ success: true, mockup: record }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Design mockups POST", "Could not save the generated preview.");
  }
}

function badRequest(code, message) {
  return { ok: false, response: Response.json({ success: false, code, message }, { status: 400 }) };
}

function uploadFailureResponse(failure) {
  return Response.json(
    { success: false, code: failure.code, message: failure.message },
    { status: failure.status }
  );
}

const RENDERER_MAX = 100000;
const EXTENT_MAX = 10000;
const AREA_MAX = 1000;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Parse and validate the `config` form field against the pure registry.
 * Returns a NORMALIZED config (only the known fields, numbers as sent) — the
 * hash is computed from exactly this object, so extraneous client fields can
 * never influence the idempotency key.
 */
async function validateConfig(form) {
  const raw = form.get("config");
  if (!raw || typeof raw !== "string") {
    return badRequest("invalid_config", "Missing mockup config.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return badRequest("invalid_config", "Mockup config must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return badRequest("invalid_config", "Mockup config must be a JSON object.");
  }

  const { renderer, template, view, color, fileId, transform, area } = parsed;

  if (!Number.isInteger(renderer) || renderer < 1 || renderer > RENDERER_MAX) {
    return badRequest("invalid_config", "config.renderer must be a positive integer.");
  }

  if (typeof template !== "string") {
    return badRequest("unknown_template", "Unknown product template.");
  }
  // Early structural validation stays pure (no DB read). Published geometry
  // is re-checked after ownership/profile authorization below.
  const templateDef = getTemplate(template);
  if (!templateDef) {
    return badRequest("unknown_template", "Unknown product template.");
  }

  if (typeof view !== "string") {
    return badRequest("unknown_view", "Unknown product view.");
  }
  const viewDef = getView(templateDef, view);
  if (!viewDef) {
    return badRequest("unknown_view", "Unknown product view.");
  }

  if (typeof color !== "string") {
    return badRequest("unknown_color", "Unknown product color.");
  }
  const colorDef = getColor(templateDef, color);
  if (!colorDef) {
    return badRequest("unknown_color", "Unknown product color.");
  }

  if (typeof fileId !== "string" || !UUID_RE.test(fileId)) {
    return badRequest("invalid_config", "config.fileId must be the artwork file id.");
  }

  if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
    return badRequest("invalid_config", "config.transform must be an object.");
  }
  const numbers = ["cx", "cy", "width", "height", "rotation"].map(
    (key) => transform[key]
  );
  if (
    !numbers.every(finite) ||
    numbers[2] <= 0 ||
    numbers[3] <= 0 ||
    Math.abs(numbers[0]) > EXTENT_MAX ||
    Math.abs(numbers[1]) > EXTENT_MAX ||
    Math.abs(numbers[4]) > EXTENT_MAX
  ) {
    return badRequest("invalid_config", "config.transform is not a valid placement.");
  }

  if (!area || typeof area !== "object" || Array.isArray(area)) {
    return badRequest("invalid_config", "config.area must be an object.");
  }
  if (
    !finite(area.widthIn) ||
    !finite(area.heightIn) ||
    area.widthIn <= 0 ||
    area.heightIn <= 0 ||
    area.widthIn > AREA_MAX ||
    area.heightIn > AREA_MAX
  ) {
    return badRequest("invalid_config", "config.area is not a valid printable area.");
  }

  return {
    ok: true,
    config: {
      renderer,
      template,
      view,
      color,
      fileId,
      transform: {
        cx: transform.cx,
        cy: transform.cy,
        width: transform.width,
        height: transform.height,
        rotation: transform.rotation,
      },
      area: { widthIn: area.widthIn, heightIn: area.heightIn },
    },
  };
}
