import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { isMissingRelation, migrationRequiredResponse } from "@/lib/creator/api";
import { hasUnpublishedChanges } from "@/lib/design-studio/template-schema";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z0-9_]{2,40}$/;
const CATEGORY_RE = /^[a-z0-9_-]{1,40}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FORMATS = new Set(["png", "jpg", "webp"]);

/** Sanity caps — the studio itself only ever produces small geometries. */
const MAX_VIEWS = 12;
const MAX_COLORS = 64;
const MAX_SIZES = 40;

/** Fields a PATCH may change. `template_key` is identity: it namespaces
 *  generated mockup folders (`mockups/<design>/<key>/…`), so renaming one
 *  would orphan every stored path. */
const UPDATABLE_FIELDS = [
  "name",
  "name_ar",
  "category",
  "dimensions_mm",
  "views",
  "colors",
  "sizes",
  "mockup_format",
  "is_active",
  "sort_order",
];

function invalid(field, message) {
  return { ok: false, field, message };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkViews(views) {
  if (!Array.isArray(views)) return invalid("views", "views must be an array.");
  if (views.length < 1) return invalid("views", "A template needs at least one view.");
  if (views.length > MAX_VIEWS) return invalid("views", `At most ${MAX_VIEWS} views.`);
  for (const view of views) {
    if (!isPlainObject(view)) return invalid("views", "Each view must be an object.");
    if (typeof view.key !== "string" || !/^[a-z0-9_]{1,40}$/.test(view.key)) {
      return invalid("views", "Every view needs a key (a-z, 0-9, _).");
    }
    if (view.label != null && (typeof view.label !== "string" || view.label.length > 60)) {
      return invalid("views", "View labels must be 60 characters or fewer.");
    }
    if (!isPlainObject(view.canvas) || !(view.canvas.w > 0) || !(view.canvas.h > 0)) {
      return invalid("views", `View "${view.key}" needs a canvas with positive w/h.`);
    }
    const area = view.print_area;
    if (
      !isPlainObject(area) ||
      ![area.x, area.y, area.w, area.h].every((n) => typeof n === "number" && Number.isFinite(n)) ||
      !(area.w > 0) ||
      !(area.h > 0)
    ) {
      return invalid("views", `View "${view.key}" needs a print_area with x/y/w/h (w/h > 0).`);
    }
  }
  return { ok: true };
}

function checkColors(colors) {
  if (!Array.isArray(colors)) return invalid("colors", "colors must be an array.");
  if (colors.length > MAX_COLORS) return invalid("colors", `At most ${MAX_COLORS} colors.`);
  for (const color of colors) {
    if (!isPlainObject(color)) return invalid("colors", "Each color must be an object.");
    if (typeof color.key !== "string" || !/^[a-z0-9_]{1,40}$/.test(color.key)) {
      return invalid("colors", "Every color needs a key (a-z, 0-9, _).");
    }
    if (typeof color.name !== "string" || color.name.length < 1 || color.name.length > 60) {
      return invalid("colors", `Color "${color.key}" needs a name of 1-60 characters.`);
    }
    if (typeof color.hex !== "string" || !HEX_RE.test(color.hex)) {
      return invalid("colors", `Color "${color.key}" needs a #rrggbb hex value.`);
    }
    if (color.shade_hex != null && (!HEX_RE.test(String(color.shade_hex)))) {
      return invalid("colors", `Color "${color.key}" has an invalid shade_hex.`);
    }
  }
  return { ok: true };
}

function checkSizes(sizes) {
  if (!Array.isArray(sizes)) return invalid("sizes", "sizes must be an array.");
  if (sizes.length > MAX_SIZES) return invalid("sizes", `At most ${MAX_SIZES} sizes.`);
  for (const size of sizes) {
    if (!isPlainObject(size)) return invalid("sizes", "Each size must be an object.");
    if (typeof size.key !== "string" || !/^[a-z0-9_]{1,40}$/.test(size.key)) {
      return invalid("sizes", "Every size needs a key (a-z, 0-9, _).");
    }
    if (typeof size.name !== "string" || size.name.length < 1 || size.name.length > 60) {
      return invalid("sizes", `Size "${size.key}" needs a name of 1-60 characters.`);
    }
  }
  return { ok: true };
}

/**
 * Validate a template body. `partial` (PATCH) only checks the fields that
 * are present; POST additionally requires the identity fields. Returns
 * `{ ok: true, value }` with the cleaned payload — never a partial mess.
 */
function validateTemplateInput(input, { partial = false } = {}) {
  if (!isPlainObject(input)) return invalid("invalid_body", "Invalid request body.");
  const value = {};

  if (!partial || "template_key" in input) {
    if (typeof input.template_key !== "string" || !KEY_RE.test(input.template_key)) {
      return invalid("template_key", "template_key must be 2-40 chars of a-z, 0-9, _.");
    }
    value.template_key = input.template_key;
  }

  if ("name" in input || !partial) {
    if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.length > 80) {
      return invalid("name", "name must be 1-80 characters.");
    }
    value.name = input.name.trim();
  }

  if ("name_ar" in input) {
    if (input.name_ar != null && (typeof input.name_ar !== "string" || input.name_ar.length > 80)) {
      return invalid("name_ar", "name_ar must be 80 characters or fewer.");
    }
    value.name_ar = input.name_ar ?? null;
  }

  if ("category" in input || !partial) {
    const category = input.category ?? "custom";
    if (typeof category !== "string" || !CATEGORY_RE.test(category)) {
      return invalid("category", "category must be 1-40 chars of a-z, 0-9, _, -.");
    }
    value.category = category;
  }

  if ("dimensions_mm" in input || !partial) {
    const dimensions = input.dimensions_mm ?? {};
    if (!isPlainObject(dimensions)) {
      return invalid("dimensions_mm", "dimensions_mm must be an object.");
    }
    value.dimensions_mm = dimensions;
  }

  if ("views" in input || !partial) {
    const result = checkViews(input.views ?? []);
    if (!result.ok) return result;
    value.views = input.views;
  }

  if ("colors" in input || !partial) {
    const result = checkColors(input.colors ?? []);
    if (!result.ok) return result;
    value.colors = input.colors;
  }

  if ("sizes" in input || !partial) {
    const result = checkSizes(input.sizes ?? []);
    if (!result.ok) return result;
    value.sizes = input.sizes;
  }

  if ("mockup_format" in input || !partial) {
    const format = input.mockup_format ?? "png";
    if (!FORMATS.has(format)) {
      return invalid("mockup_format", "mockup_format must be png, jpg or webp.");
    }
    value.mockup_format = format;
  }

  if ("is_active" in input) {
    if (typeof input.is_active !== "boolean") {
      return invalid("is_active", "is_active must be a boolean.");
    }
    value.is_active = input.is_active;
  }

  if ("sort_order" in input) {
    if (!Number.isInteger(input.sort_order)) {
      return invalid("sort_order", "sort_order must be an integer.");
    }
    value.sort_order = input.sort_order;
  }

  return { ok: true, value };
}

function validationResponse(result) {
  return Response.json(
    { success: false, code: `invalid_${result.field}`, field: result.field, message: result.message },
    { status: 400 }
  );
}

function missingResponse() {
  return migrationRequiredResponse("admin.creator-templates");
}

/**
 * GET /api/admin/creator-templates — full catalog (8 seeded product types)
 * for the admin template/area management screen.
 */
export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("creator_product_templates")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      if (isMissingRelation(error)) return missingResponse();
      throw error;
    }

    const templates = (data ?? []).map((row) => ({
      ...row,
      has_unpublished_changes: hasUnpublishedChanges(row),
    }));
    return Response.json({ success: true, templates });
  } catch (error) {
    return handleApiError(error, "Admin Creator Templates GET", "Failed to load templates");
  }
}

/** POST /api/admin/creator-templates — create a product-type template. */
export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return validationResponse(invalid("invalid_body", "Invalid request body."));
    }

    const validated = validateTemplateInput(body);
    if (!validated.ok) return validationResponse(validated);

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("creator_product_templates")
      .insert({
        ...validated.value,
        sort_order: validated.value.sort_order ?? 0,
        is_active: validated.value.is_active ?? true,
      })
      .select("*")
      .single();
    if (error) {
      if (isMissingRelation(error)) return missingResponse();
      if (error.code === "23505") {
        return Response.json(
          { success: false, code: "template_key_taken", message: "That template_key already exists." },
          { status: 409 }
        );
      }
      throw error;
    }

    logger.info("[Admin Creator Templates] created", {
      id: data?.id,
      templateKey: validated.value.template_key,
      by: auth.user.id,
    });

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "creator_template.create",
      entityType: "creator_product_template",
      entityId: data?.id ?? null,
      details: { template_key: validated.value.template_key },
    });

    return Response.json({ success: true, template: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Admin Creator Templates POST", "Could not create the template");
  }
}

/** PATCH /api/admin/creator-templates — partial update (never template_key). */
export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return validationResponse(invalid("invalid_body", "Invalid request body."));
    }

    const id = body?.id;
    if (!UUID_RE.test(String(id ?? ""))) {
      return validationResponse(invalid("id", "Template id is required."));
    }
    if (body?.template_key != null) {
      return validationResponse(
        invalid("template_key", "template_key cannot be changed after creation.")
      );
    }

    // Published geometry is immutable here. Only /creator-templates/publish
    // may write the published_* snapshot and geometry_version.
    const PUBLISHED_FIELDS = [
      "published_dimensions_mm",
      "published_views",
      "published_colors",
      "published_sizes",
      "is_published",
      "published_at",
      "geometry_version",
    ];
    for (const field of PUBLISHED_FIELDS) {
      if (field in body) {
        return validationResponse(
          invalid(field, `${field} can only be changed by publishing a template.`)
        );
      }
    }

    const validated = validateTemplateInput(body, { partial: true });
    if (!validated.ok) return validationResponse(validated);

    const payload = {};
    for (const field of UPDATABLE_FIELDS) {
      if (field in validated.value) payload[field] = validated.value[field];
    }
    if (Object.keys(payload).length === 0) {
      return validationResponse(invalid("no_changes", "Nothing to update."));
    }

    const db = getServiceRoleClient();
    const { data: existing, error: readError } = await db
      .from("creator_product_templates")
      .select("id, template_key")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      if (isMissingRelation(readError)) return missingResponse();
      throw readError;
    }
    if (!existing) {
      return Response.json(
        { success: false, code: "not_found", message: "Template not found." },
        { status: 404 }
      );
    }

    const { data, error } = await db
      .from("creator_product_templates")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      if (isMissingRelation(error)) return missingResponse();
      throw error;
    }

    logger.info("[Admin Creator Templates] updated", {
      id,
      fields: Object.keys(payload),
      by: auth.user.id,
    });

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "creator_template.update",
      entityType: "creator_product_template",
      entityId: id,
      details: { fields: Object.keys(payload), template_key: existing.template_key },
    });

    return Response.json({ success: true, template: data ?? { id, ...payload } });
  } catch (error) {
    return handleApiError(error, "Admin Creator Templates PATCH", "Could not update the template");
  }
}

/**
 * DELETE /api/admin/creator-templates — hard delete (the table has no soft
 * delete column). Configurations reference templates with ON DELETE
 * RESTRICT, so an in-use template answers 409: deactivate it instead.
 */
export async function DELETE(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!UUID_RE.test(String(id ?? ""))) {
      return validationResponse(invalid("id", "Template id is required."));
    }

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("creator_product_templates")
      .delete()
      .eq("id", id)
      .select("id, template_key")
      .maybeSingle();
    if (error) {
      if (isMissingRelation(error)) return missingResponse();
      if (error.code === "23503") {
        return Response.json(
          {
            success: false,
            code: "template_in_use",
            message:
              "Product configurations still use this template. Deactivate it instead (is_active = false).",
          },
          { status: 409 }
        );
      }
      throw error;
    }
    if (!data) {
      return Response.json(
        { success: false, code: "not_found", message: "Template not found." },
        { status: 404 }
      );
    }

    logger.info("[Admin Creator Templates] deleted", {
      id,
      templateKey: data.template_key,
      by: auth.user.id,
    });

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "creator_template.delete",
      entityType: "creator_product_template",
      entityId: id,
      details: { template_key: data.template_key },
    });

    return Response.json({ success: true, deleted: true });
  } catch (error) {
    return handleApiError(error, "Admin Creator Templates DELETE", "Could not delete the template");
  }
}
