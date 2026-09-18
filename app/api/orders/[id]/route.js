import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// GET - Fetch single order with items
export async function GET(request, { params }) {
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

    const { id } = await params;

    if (!id) {
      return Response.json(
        { success: false, message: "Order ID is required" },
        { status: 400 }
      );
    }

    // Fetch order (RLS ensures user can only see their own)
    const { data: order, error: orderError } = await SupabaseClient
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (orderError || !order) {
      return Response.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    // Fetch order items
    const { data: items } = await SupabaseClient
      .from("order_items")
      .select("*")
      .eq("order_id", id);

    return Response.json({
      success: true,
      order: { ...order, items: items || [] },
    });
  } catch (error) {
    logger.error("[Order GET Error]", error);
    return Response.json(
      { success: false, message: "Failed to fetch order" },
      { status: 500 }
    );
  }
}
