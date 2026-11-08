import { createClient } from "@supabase/supabase-js";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-errors";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST - Vote on a review (helpful/not helpful)
export async function POST(request, { params }) {
  try {
    const { id: review_id } = await params;
    if (!UUID_RE.test(String(review_id || ""))) {
      return Response.json({ success: false, message: "Invalid review id" }, { status: 400 });
    }

    const { allowed } = await checkRateLimitAsync(`review-vote:${getClientIp(request)}`, {
      maxRequests: 20,
      failureMode: "fail_open",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

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

    const body = await request.json().catch(() => ({}));
    const vote_type = body?.vote_type;
    if (!vote_type || !["helpful", "not_helpful"].includes(vote_type)) {
      return Response.json(
        { success: false, message: "vote_type must be 'helpful' or 'not_helpful'" },
        { status: 400 }
      );
    }

    // The review must exist and must not belong to the voter. Reviews are
    // publicly readable, so this check cannot leak anything.
    const { data: review, error: reviewError } = await SupabaseClient
      .from("reviews")
      .select("id, user_id, deleted_at")
      .eq("id", review_id)
      .maybeSingle();

    if (reviewError) throw reviewError;
    if (!review || review.deleted_at) {
      return Response.json({ success: false, message: "Review not found" }, { status: 404 });
    }
    if (review.user_id === user.id) {
      return Response.json(
        { success: false, message: "You cannot vote on your own review" },
        { status: 403 }
      );
    }

    // Duplicate handling: an unchanged vote is rejected here when the vote
    // table is readable. If RLS hides it, the RPC/unique constraint still
    // protects the data and its error is mapped below.
    const { data: existing, error: existingError } = await SupabaseClient
      .from("review_votes")
      .select("id, vote_type")
      .eq("review_id", review_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingError && existing && existing.vote_type === vote_type) {
      return Response.json(
        { success: false, message: "You have already cast this vote" },
        { status: 409 }
      );
    }

    const { data, error } = await SupabaseClient.rpc("vote_review", {
      p_review_id: review_id,
      p_vote_type: vote_type,
    });

    if (error) {
      const message = String(error.message || "");
      if (/duplicate|unique|already/i.test(message)) {
        return Response.json(
          { success: false, message: "You have already voted on this review" },
          { status: 409 }
        );
      }
      if (/not found|does not exist/i.test(message)) {
        return Response.json({ success: false, message: "Review not found" }, { status: 404 });
      }
      throw error;
    }

    return Response.json({ success: true, vote_type, result: data });
  } catch (error) {
    return handleApiError(error, "Vote Review POST", "Failed to vote");
  }
}
