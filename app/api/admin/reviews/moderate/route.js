import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { handleApiError } from "@/lib/api-errors";

const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected", "hidden"]);

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    // admin_reviews_moderation_queue is a service-role-only view.
    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("admin_reviews_moderation_queue")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ success: true, reviews: data || [] });
  } catch (error) {
    return handleApiError(error, "Admin Reviews GET", "Failed to fetch reviews");
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const { review_id, new_status, note } = body || {};

    if (!review_id || !new_status) {
      return Response.json(
        { success: false, message: "review_id and new_status are required" },
        { status: 400 }
      );
    }
    if (!ALLOWED_STATUSES.has(new_status)) {
      return Response.json({ success: false, message: "Invalid review status" }, { status: 400 });
    }

    // moderate_review() is SECURITY DEFINER and itself checks is_admin(), so it
    // must run with the caller's JWT (auth.uid() is the acting administrator).
    const token = request.headers.get("authorization").replace("Bearer ", "");
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data, error } = await userClient.rpc("moderate_review", {
      p_review_id: review_id,
      p_new_status: new_status,
      p_note: note || null,
    });

    if (error) throw error;
    return Response.json({ success: true, result: data });
  } catch (error) {
    return handleApiError(error, "Admin Reviews POST", "Failed to moderate review");
  }
}
