import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-errors";
import {
  isMissingRelation,
  migrationRequiredResponse,
  requireUser,
} from "@/lib/creator/api";
import { migrationGuard } from "@/lib/design-studio/server";
import {
  PRODUCT_ROW_SELECT,
  normalizeProductRow,
  validateProductCreate,
} from "@/lib/design-studio/product-input";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTemplateForProduct } from "@/lib/design-studio/template-catalog";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(message) {
  return Response.json({ success: false, code: "not_found", message }, { status: 404 });
}

function rateLimited() {
  return Response.json(
    { success: false, message: "Too many requests. Please try again in a minute." },
    { status: 429 }
  );
}

const VALIDATION_MESSAGES = {
  not_an_object: "Request body must be a JSON object.",
  empty_patch: "Nothing to update.",
  invalid_template: "Unknown product type.",
  invalid_colors: "Unknown color selection.",
  invalid_sizes: "Unknown size selection.",
  invalid_view_states: "Invalid placement override.",
};

function validationResponse(result) {
  return Response.json(
    {
      success: false,
      code: result.code,
      field: result.field,
      message:
        result.code === "field_not_allowed"
          ? `Field "${result.field}" cannot be set here.`
          : VALIDATION_MESSAGES[result.code] ?? "Invalid request.",
    },
    { status: 400 }
  );
}

/** Owner-scoped existence check with the CALLER's JWT — proves ownership. */
async function loadOwnedDesign(auth, id) {
  const { data, error } = await auth.client
    .from("user_designs")
    .select("id")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * GET /api/designs/[id]/products — the design's live product configurations
 * (read through the caller's JWT: the `owns_design` SELECT policy is a second
 * gate after the explicit owner check above).
 */
export async function GET(request, { params }) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(String(id))) return notFound("Design not found.");

    const guard = await migrationGuard(auth.client, "designs.products");
    if (guard.missing) return guard.response;

    const owned = await loadOwnedDesign(auth, id);
    if (!owned) return notFound("Design not found.");

    const { data, error } = await auth.client
      .from("creator_design_products")
      .select(PRODUCT_ROW_SELECT)
      .eq("design_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      if (isMissingRelation(error)) return migrationRequiredResponse("designs.products");
      throw error;
    }

    return Response.json({
      success: true,
      products: (data ?? []).map(normalizeProductRow),
    });
  } catch (error) {
    return handleApiError(
      error,
      "Design products GET",
      "Could not load product configurations."
    );
  }
}

/**
 * POST /api/designs/[id]/products — add this design to a product type.
 * Idempotent: an existing live row for (design × template) is returned with
 * `created: false` and NEVER overwritten (first write wins), so a double
 * submit can never duplicate a catalog entry — the unique index is the
 * backstop, this is the honest front door.
 */
export async function POST(request, { params }) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`design-products:${ip}`, {
      maxRequests: 30,
      failureMode: "fail_open",
    });
    if (!allowed) return rateLimited();

    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(String(id))) return notFound("Design not found.");

    // The four studio tables live in the migration — honest 503 BEFORE the
    // body is read or anything is written.
    const guard = await migrationGuard(auth.client, "designs.products");
    if (guard.missing) return guard.response;

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { success: false, code: "invalid_body", message: "Request body must be JSON." },
        { status: 400 }
      );
    }

    // Pure validation first: invalid payloads are rejected without any DB read.
    const earlyValidated = validateProductCreate(body);
    if (!earlyValidated.ok) return validationResponse(earlyValidated);

    const owned = await loadOwnedDesign(auth, id);
    if (!owned) return notFound("Design not found.");

    // Persona is public by design; we only read our own profile id from it.
    const { data: profile, error: profileError } = await auth.client
      .from("creator_profiles")
      .select("id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (profileError) {
      if (isMissingRelation(profileError)) {
        return migrationRequiredResponse("designs.products");
      }
      throw profileError;
    }
    if (!profile) {
      return Response.json(
        {
          success: false,
          code: "creator_profile_required",
          message: "Create your creator profile before configuring products.",
        },
        { status: 403 }
      );
    }

    // Validated against the DB-published template (single source of truth),
    // only after ownership/profile checks so unauthorized calls never touch
    // the catalog.
    const templateKey = typeof body?.template_key === "string" ? body.template_key : "";
    const resolved = templateKey ? await resolveTemplateForProduct(templateKey) : null;
    const validated = validateProductCreate(body, resolved?.template ?? null);
    if (!validated.ok) return validationResponse(validated);
    const value = validated.value;

    const admin = getServiceRoleClient();

    const { data: catalogRow, error: catalogError } = await admin
      .from("creator_product_templates")
      .select("id, is_active")
      .eq("template_key", value.template_key)
      .maybeSingle();
    if (catalogError) {
      if (isMissingRelation(catalogError)) {
        return migrationRequiredResponse("designs.products");
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
    if (!catalogRow.is_active) {
      return Response.json(
        {
          success: false,
          code: "template_inactive",
          message: "This product type is not available right now.",
        },
        { status: 400 }
      );
    }

    const readRow = async () => {
      const { data, error } = await admin
        .from("creator_design_products")
        .select(PRODUCT_ROW_SELECT)
        .eq("design_id", id)
        .eq("template_id", catalogRow.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    const existing = await readRow();
    if (existing) {
      return Response.json(
        { success: true, created: false, product: normalizeProductRow(existing) },
        { status: 200 }
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from("creator_design_products")
      .insert({
        design_id: id,
        template_id: catalogRow.id,
        creator_profile_id: profile.id,
        view_states: {},
        selected_colors: value.selected_colors,
        selected_sizes: value.selected_sizes,
        mockups: [],
      })
      .select(PRODUCT_ROW_SELECT);

    if (insertError) {
      if (insertError.code === "23505") {
        // Lost the race for the design×template row: the winner's row is the
        // truth — return it untouched instead of clobbering its configuration.
        const raced = await readRow();
        if (raced) {
          return Response.json(
            { success: true, created: false, product: normalizeProductRow(raced) },
            { status: 200 }
          );
        }
      }
      throw insertError;
    }

    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row) {
      // insert().select() returning nothing should be impossible; re-read so
      // the response still reflects the real row instead of fabricating one.
      const reread = await readRow();
      if (reread) {
        return Response.json(
          { success: true, created: false, product: normalizeProductRow(reread) },
          { status: 200 }
        );
      }
      throw new Error("product insert returned no row");
    }

    return Response.json(
      { success: true, created: true, product: normalizeProductRow(row) },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "Design products POST", "Could not add the product.");
  }
}
