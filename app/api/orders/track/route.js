import { createClient } from "@supabase/supabase-js";

// GET - Track order by ID and email using views
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");
    const email = searchParams.get("email");

    if (!orderId || !email) {
      return Response.json(
        { success: false, message: "Order ID and email are required" },
        { status: 400 }
      );
    }

    const SupabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Use order_summary view for order details
    const { data: orderSummary, error: summaryError } = await SupabaseClient
      .from("order_summary")
      .select("*")
      .eq("id", orderId)
      .single();

    if (summaryError || !orderSummary) {
      return Response.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    // Verify email matches
    const orderEmail = orderSummary.shipping_address_snapshot?.email || orderSummary.customer_note;
    if (orderEmail !== email) {
      return Response.json(
        { success: false, message: "Email does not match this order" },
        { status: 403 }
      );
    }

    // Use order_items_detailed view for items
    const { data: items } = await SupabaseClient
      .from("order_items_detailed")
      .select("*")
      .eq("order_id", orderId);

    // Use shipment_tracking view for shipments
    const { data: shipments } = await SupabaseClient
      .from("shipment_tracking")
      .select("*")
      .eq("order_id", orderId);

    return Response.json({
      success: true,
      order: {
        ...orderSummary,
        items: items || [],
        shipments: shipments || [],
      },
    });
  } catch {
    return Response.json(
      { success: false, message: "Failed to track order" },
      { status: 500 }
    );
  }
}
