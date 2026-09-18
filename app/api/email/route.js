import { createClient } from "@supabase/supabase-js";
import { sendOrderConfirmation, sendOrderStatusUpdate } from "@/lib/email";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// POST - Send email
export async function POST(request) {
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

    const { type, order_id } = await request.json();

    if (!type || !order_id) {
      return Response.json(
        { success: false, message: "type and order_id are required" },
        { status: 400 }
      );
    }

    // Fetch order with items
    const { data: order, error: orderError } = await SupabaseClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
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
      .eq("order_id", order_id);

    const customerName = order.shipping_address_snapshot?.full_name || "Customer";
    const customerEmail = order.shipping_address_snapshot?.email || order.customer_note;

    if (!customerEmail) {
      return Response.json(
        { success: false, message: "Customer email not found" },
        { status: 400 }
      );
    }

    let result;

    if (type === "confirmation") {
      result = await sendOrderConfirmation({
        orderId: order.id,
        customerName,
        customerEmail,
        items: (items ?? []).map((item) => ({
          name: item.product_name_snapshot,
          quantity: item.quantity,
          price: item.unit_price_snapshot,
        })),
        subtotal: order.subtotal,
        shipping: order.shipping_fee,
        total: order.total,
        shippingAddress: order.shipping_address_snapshot,
      });
    } else if (type === "status_update") {
      result = await sendOrderStatusUpdate({
        orderId: order.id,
        customerName,
        customerEmail,
        status: order.status,
        total: order.total,
      });
    } else {
      return Response.json(
        { success: false, message: "Invalid email type" },
        { status: 400 }
      );
    }

    return Response.json({ success: true, result });
  } catch (error) {
    return handleApiError(error, "Email POST", "Failed to send email");
  }
}
