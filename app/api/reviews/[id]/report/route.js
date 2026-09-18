import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// POST - Report a review
export async function POST(request, { params }) {
  try {
    const { id: review_id } = await params;
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);
    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const { reason, details } = await request.json();
    if (!reason) {
      return Response.json(
        { success: false, message: "reason is required" },
        { status: 400 }
      );
    }

    const { data, error } = await SupabaseClient.rpc("report_review", {
      p_review_id: review_id,
      p_reason: reason,
      p_details: details || null,
    });

    if (error) throw error;
    return Response.json({ success: true, result: data });
  } catch (error) {
    return handleApiError(error, "Report Review POST", "Failed to report review");
  }
}
