import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { isMissingRelation, migrationRequiredResponse } from "@/lib/creator/api";

export const runtime = "nodejs";

const MIGRATION_FILE = "supabase/migrations/20261116130000_custom_print_studio.sql";

function bad(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

/** GET — submission queue + mockup catalog for the existing admin dashboard. */
export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return bad(auth.error, auth.status);

    const db = getServiceRoleClient();
    const [templates, submissions] = await Promise.all([
      db.from("mockup_templates").select("*").is("deleted_at", null).order("sort_order"),
      db.from("shared_designs")
        .select("id, design_id, title, author_display_name, status, submitted_at, rejection_reason, created_at")
        .is("deleted_at", null)
        .order("submitted_at", { ascending: false }),
    ]);
    if (isMissingRelation(templates.error) || isMissingRelation(submissions.error)) {
      return migrationRequiredResponse("admin.custom-print", MIGRATION_FILE);
    }
    if (templates.error) throw templates.error;
    if (submissions.error) throw submissions.error;

    return Response.json({
      success: true,
      templates: templates.data ?? [],
      submissions: submissions.data ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Admin custom print GET", "Could not load custom print data.");
  }
}

/**
 * POST — moderate a shared design. Approvals are admin-only; the caller can
 * never submit their own decision from a client (verifyAdmin is authoritative).
 */
export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return bad(auth.error, auth.status);

    const body = await request.json().catch(() => null);
    const id = String(body?.id ?? "");
    const action = String(body?.action ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return bad("A valid submission id is required.");
    if (!["approve", "reject", "archive"].includes(action)) return bad("Invalid action.");
    const reason = String(body?.reason ?? "").trim().slice(0, 500);
    if (action === "reject" && !reason) return bad("A rejection reason is required.");

    const db = getServiceRoleClient();
    const patch = {
      status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "archived",
      rejection_reason: action === "reject" ? reason : null,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
      ...(action === "approve" ? { published_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    };

    // Guard against double decisions: only a pending row can be reviewed.
    const { data: updated, error } = await db
      .from("shared_designs")
      .update(patch)
      .eq("id", id)
      .eq("status", "pending_review")
      .is("deleted_at", null)
      .select("id, status, owner_id, design_id")
      .maybeSingle();
    if (isMissingRelation(error)) return migrationRequiredResponse("admin.custom-print", MIGRATION_FILE);
    if (error) throw error;
    if (!updated) return bad("This submission is no longer pending.", 409);

    await db.from("admin_audit_log").insert({
      actor_id: auth.user.id,
      actor_email: auth.user.email ?? null,
      action: `shared_design_${action === "approve" ? "approved" : action === "reject" ? "rejected" : "archived"}`,
      entity_type: "shared_design",
      entity_id: id,
      details: { design_id: updated.design_id, reason },
    });

    return Response.json({ success: true, submission: updated });
  } catch (error) {
    return handleApiError(error, "Admin custom print POST", "Could not update the submission.");
  }
}

/** PATCH — enable/disable a mockup template or change its store product link. */
export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return bad(auth.error, auth.status);

    const body = await request.json().catch(() => null);
    const id = String(body?.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return bad("A valid template id is required.");

    const patch = {};
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (body.store_product_id === null || /^[0-9a-f-]{36}$/i.test(String(body.store_product_id ?? ""))) {
      patch.store_product_id = body.store_product_id || null;
    }
    if (body.store_variant_id === null || /^[0-9a-f-]{36}$/i.test(String(body.store_variant_id ?? ""))) {
      patch.store_variant_id = body.store_variant_id || null;
    }
    if (Object.keys(patch).length === 0) return bad("Nothing to update.");
    patch.updated_at = new Date().toISOString();

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("mockup_templates")
      .update(patch)
      .eq("id", id)
      .is("deleted_at", null)
      .select("id, template_key, is_active, store_product_id, store_variant_id")
      .maybeSingle();
    if (isMissingRelation(error)) return migrationRequiredResponse("admin.custom-print", MIGRATION_FILE);
    if (error) throw error;
    if (!data) return bad("Template not found.", 404);

    await db.from("admin_audit_log").insert({
      actor_id: auth.user.id,
      actor_email: auth.user.email ?? null,
      action: "mockup_template_updated",
      entity_type: "mockup_template",
      entity_id: id,
      details: patch,
    });

    return Response.json({ success: true, template: data });
  } catch (error) {
    return handleApiError(error, "Admin custom print PATCH", "Could not update the template.");
  }
}
