import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { handleApiError } from "@/lib/api-errors";

// GET - read-only administrative audit trail (service role only).
export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const requestedLimit = Number(searchParams.get("limit") || 100);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
      : 100;
    const entityType = searchParams.get("entity_type");
    const action = searchParams.get("action");

    const db = getServiceRoleClient();
    let query = db
      .from("admin_audit_log")
      .select("id, actor_id, actor_email, action, entity_type, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (entityType) query = query.eq("entity_type", entityType);
    if (action) query = query.eq("action", action);

    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ success: true, entries: data || [] });
  } catch (error) {
    return handleApiError(error, "Admin Audit GET", "Failed to load audit log");
  }
}
