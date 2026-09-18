import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// POST - Create return request
export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const { allowed } = checkRateLimit(`return:${ip}`);

  if (!allowed) {
    return Response.json(
      { success: false, message: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
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

    const { order_id, items, reason } = await request.json();

    if (!order_id) {
      return Response.json(
        { success: false, message: "order_id is required" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json(
        { success: false, message: "At least one item is required" },
        { status: 400 }
      );
    }

    if (!reason) {
      return Response.json(
        { success: false, message: "Reason is required" },
        { status: 400 }
      );
    }

    // Use the create_return_request RPC which handles ownership, eligibility, quantity validation
    const { data: returnRequest, error: returnError } = await SupabaseClient
      .rpc("create_return_request", {
        p_order_id: order_id,
        p_items: items,
        p_reason: reason,
      });

    if (returnError) {
      logger.error("[Return Request Error]", returnError);
      return Response.json(
        { success: false, message: returnError.message || "Failed to create return request" },
        { status: 400 }
      );
    }

    return Response.json({ success: true, return: returnRequest }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Return Request POST", "Failed to create return request");
  }
}

// GET - Fetch user's returns
export async function GET(request) {
  try {
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

    const { data: returns, error } = await SupabaseClient
      .from("returns")
      .select("*, return_items(*)")
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json({ success: true, returns: returns ?? [] });
  } catch (error) {
    return handleApiError(error, "Returns GET", "Failed to fetch returns");
  }
}
