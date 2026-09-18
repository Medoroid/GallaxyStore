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

// POST - Vote on a review (helpful/not helpful)
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

    const { vote_type } = await request.json();
    if (!vote_type || !["helpful", "not_helpful"].includes(vote_type)) {
      return Response.json(
        { success: false, message: "vote_type must be 'helpful' or 'not_helpful'" },
        { status: 400 }
      );
    }

    const { data, error } = await SupabaseClient.rpc("vote_review", {
      p_review_id: review_id,
      p_vote_type: vote_type,
    });

    if (error) throw error;
    return Response.json({ success: true, result: data });
  } catch (error) {
    return handleApiError(error, "Vote Review POST", "Failed to vote");
  }
}
