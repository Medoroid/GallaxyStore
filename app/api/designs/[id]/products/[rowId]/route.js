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
  validateProductPatch,
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
 * Load one live product row with the CALLER's JWT: the explicit
 * design_id binding plus the `owns_design` SELECT policy mean a row that
 * isn't part of a design the caller owns is a 404 — no existence leak.
 */
async function loadOwnedRow(auth, id, rowId) {
  const { data, error } = await auth.client
    .from("creator_design_products")
    .select(PRODUCT_ROW_SELECT)
    .eq("id", rowId)
    .eq("design_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return { missing: true };
    throw error;
  }
  return { row: data };
}

/**
 * PATCH /api/designs/[id]/products/[rowId] — presentation-only updates.
 *
 * Allow-list (enforced purely, before any write): `view_states`,
 * `selected_colors`, `selected_sizes`. Approval state, the commerce link,
 * fulfillment, ownership and the generated `mockups` records are structurally
 * rejected — mockups are written only by the dedicated mockups pipeline,
 * which recomputes every record it stores. Values are validated against the
 * TS registry (the rendering authority) for the row's own template.
 */
export async function PATCH(request, { params }) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`design-products:${ip}`, {
      maxRequests: 30,
      failureMode: "fail_open",
    });
    if (!allowed) return rateLimited();

    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { id, rowId } = await params;
    if (!UUID_RE.test(String(id)) || !UUID_RE.test(String(rowId))) {
      return notFound("Product configuration not found.");
    }

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

    const owned = await loadOwnedDesign(auth, id);
    if (!owned) return notFound("Design not found.");

    const loaded = await loadOwnedRow(auth, id, rowId);
    if (loaded.missing) return migrationRequiredResponse("designs.products");
    if (!loaded.row) return notFound("Product configuration not found.");

    // Single source of truth: DB-published geometry, registry only as fallback.
    const templateKey = loaded.row.creator_product_templates?.template_key;
    const resolved = typeof templateKey === "string" ? await resolveTemplateForProduct(templateKey) : null;
    if (!resolved) {
      return Response.json(
        {
          success: false,
          code: "templates_not_seeded",
          message: "No published product template is available for this product.",
        },
        { status: 503 }
      );
    }

    const validated = validateProductPatch(body, resolved.template);
    if (!validated.ok) return validationResponse(validated);
    const value = validated.value;

    const admin = getServiceRoleClient();
    const { data, error } = await admin
      .from("creator_design_products")
      .update(value)
      .eq("id", rowId)
      .eq("design_id", id)
      .is("deleted_at", null)
      .select(PRODUCT_ROW_SELECT);
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      // Deleted between the read and the write — the truth wins.
      return notFound("Product configuration not found.");
    }

    return Response.json({ success: true, product: normalizeProductRow(row) });
  } catch (error) {
    return handleApiError(
      error,
      "Design product PATCH",
      "Could not update the product configuration."
    );
  }
}

/**
 * DELETE /api/designs/[id]/products/[rowId] — SOFT delete (`deleted_at`):
 * the row keeps its audit trail and the unique partial index immediately
 * allows re-adding the same product type later. Never a hard delete — the
 * admin review state lives on this row.
 *
 * A row that already produced a store listing (`product_id` set) is refused
 * with 409 product_linked: that row IS the listing's management record
 * (review state + attribution), and removing it would orphan a live product
 * the creator can no longer manage. Withdrawal is an admin action.
 */
export async function DELETE(request, { params }) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`design-products:${ip}`, {
      maxRequests: 30,
      failureMode: "fail_open",
    });
    if (!allowed) return rateLimited();

    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { id, rowId } = await params;
    if (!UUID_RE.test(String(id)) || !UUID_RE.test(String(rowId))) {
      return notFound("Product configuration not found.");
    }

    const guard = await migrationGuard(auth.client, "designs.products");
    if (guard.missing) return guard.response;

    const owned = await loadOwnedDesign(auth, id);
    if (!owned) return notFound("Design not found.");

    const loaded = await loadOwnedRow(auth, id, rowId);
    if (loaded.missing) return migrationRequiredResponse("designs.products");
    if (!loaded.row) return notFound("Product configuration not found.");

    if (loaded.row.product_id) {
      return Response.json(
        {
          success: false,
          code: "product_linked",
          message:
            "This product is linked to a store listing and can't be removed here.",
        },
        { status: 409 }
      );
    }

    const admin = getServiceRoleClient();
    const { error } = await admin
      .from("creator_design_products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", rowId)
      .eq("design_id", id)
      .is("deleted_at", null);
    if (error) throw error;

    // Idempotent: a row already gone (race) is still a successful outcome.
    return Response.json({ success: true, id: rowId });
  } catch (error) {
    return handleApiError(
      error,
      "Design product DELETE",
      "Could not remove the product configuration."
    );
  }
}
