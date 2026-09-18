import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "../../_lib/verifyAdmin";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const { data, error } = await SupabaseClient
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
      return Response.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const { review_id, new_status, note } = await request.json();

    if (!review_id || !new_status) {
      return Response.json(
        { success: false, message: "review_id and new_status are required" },
        { status: 400 }
      );
    }

    const { data, error } = await SupabaseClient.rpc("moderate_review", {
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
