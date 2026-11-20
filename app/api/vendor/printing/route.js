import { createClient } from "@supabase/supabase-js";
import { handleApiError } from "@/lib/api-errors";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

/**
 * POST /api/vendor/printing
 * Ownership-checked print-job transitions for the vendor print queue:
 *   queued -> printing -> completed
 * The store id is ALWAYS derived from auth.uid(), never from the request body.
 */
export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ success: false, message: "Authorization required" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = getSupabaseForUser(token);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return Response.json({ success: false, message: "Invalid token" }, { status: 401 });
    }

    const { data: store, error: storeError } = await userClient
      .from("stores")
      .select("id")
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store) {
      return Response.json(
        { success: false, message: "No store found for this account" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const jobId = body?.print_job_id;
    const action = body?.action;
    if (!jobId || !["start", "complete"].includes(action)) {
      return Response.json(
        { success: false, message: "print_job_id and a valid action are required" },
        { status: 400 }
      );
    }

    const { data: job, error: jobError } = await userClient
      .from("print_jobs")
      .select("id, store_id, status")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job || job.store_id !== store.id) {
      return Response.json({ success: false, message: "Print job not found" }, { status: 404 });
    }

    const nextStatus = action === "start" ? "printing" : "completed";
    const allowed = action === "start" ? job.status === "queued" : job.status === "printing";
    if (!allowed) {
      return Response.json(
        { success: false, message: `Cannot ${action} a job in status "${job.status}"` },
        { status: 409 }
      );
    }

    const patch =
      action === "start"
        ? { status: "printing", started_at: new Date().toISOString() }
        : { status: "completed", completed_at: new Date().toISOString() };

    const { error: updateError } = await userClient
      .from("print_jobs")
      .update(patch)
      .eq("id", jobId)
      .eq("store_id", store.id);
    if (updateError) throw updateError;

    return Response.json({ success: true, status: nextStatus });
  } catch (error) {
    return handleApiError(error, "Vendor Printing", "Unable to update the print job.");
  }
}
