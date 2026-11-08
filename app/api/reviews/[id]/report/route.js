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
const ALLOWED_REASONS = new Set([
  "inappropriate",
  "spam",
  "harassment",
  "off_topic",
  "fake",
  "other",
]);
const MAX_DETAILS_LENGTH = 1000;

// POST - Report a review
export async function POST(request, { params }) {
  try {
    const { id: review_id } = await params;
    if (!UUID_RE.test(String(review_id || ""))) {
      return Response.json({ success: false, message: "Invalid review id" }, { status: 400 });
    }

    const { allowed } = await checkRateLimitAsync(`review-report:${getClientIp(request)}`, {
      maxRequests: 10,
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
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!ALLOWED_REASONS.has(reason)) {
      return Response.json(
        { success: false, message: "Choose a valid report reason" },
        { status: 400 }
      );
    }

    const details =
      typeof body?.details === "string" && body.details.trim()
        ? body.details.trim()
        : null;
    if (details && details.length > MAX_DETAILS_LENGTH) {
      return Response.json(
        { success: false, message: "Report details are too long" },
        { status: 400 }
      );
    }

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
        { success: false, message: "You cannot report your own review" },
        { status: 403 }
      );
    }

    // One open report per user per review. If the table is hidden by RLS the
    // RPC/unique constraint is still the guard; its error is mapped below.
    const { data: existing, error: existingError } = await SupabaseClient
      .from("review_reports")
      .select("id, status")
      .eq("review_id", review_id)
      .eq("reported_by", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!existingError && existing) {
      return Response.json(
        { success: false, message: "You have already reported this review" },
        { status: 409 }
      );
    }

    const { data, error } = await SupabaseClient.rpc("report_review", {
      p_review_id: review_id,
      p_reason: reason,
      p_details: details,
    });

    if (error) {
      const message = String(error.message || "");
      if (/duplicate|unique|already/i.test(message)) {
        return Response.json(
          { success: false, message: "You have already reported this review" },
          { status: 409 }
        );
      }
      if (/not found|does not exist/i.test(message)) {
        return Response.json({ success: false, message: "Review not found" }, { status: 404 });
      }
      throw error;
    }

    return Response.json({ success: true, reason, result: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Report Review POST", "Failed to report review");
  }
}
