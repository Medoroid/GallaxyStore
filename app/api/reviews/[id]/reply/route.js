import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// POST - Reply to a review
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
    const SupabaseClient = getSupabaseForUser(token);
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);
    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const { body, parent_reply_id } = await request.json();
    if (!body || body.trim().length === 0) {
      return Response.json(
        { success: false, message: "Reply body is required" },
        { status: 400 }
      );
    }

    const { data, error } = await SupabaseClient.rpc("reply_to_review", {
      p_review_id: review_id,
      p_body: body,
      p_parent_reply_id: parent_reply_id || null,
    });

    if (error) throw error;
    return Response.json({ success: true, reply: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Reply Review POST", "Failed to reply");
  }
}
