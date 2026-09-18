import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// POST - Cancel an order
export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const { allowed } = checkRateLimit(`cancel:${ip}`);

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

    const { order_id, reason } = await request.json();

    if (!order_id) {
      return Response.json(
        { success: false, message: "order_id is required" },
        { status: 400 }
      );
    }

    // Use the cancel_order RPC which handles ownership check, status validation, restock
    const { data: order, error: cancelError } = await SupabaseClient
      .rpc("cancel_order", {
        p_order_id: order_id,
        p_reason: reason || null,
      });

    if (cancelError) {
      logger.error("[Cancel Order Error]", cancelError);
      return Response.json(
        { success: false, message: cancelError.message || "Failed to cancel order" },
        { status: 400 }
      );
    }

    return Response.json({ success: true, order });
  } catch (error) {
    return handleApiError(error, "Cancel Order POST", "Failed to cancel order");
  }
}
