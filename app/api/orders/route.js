import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// GET - Fetch user's orders
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
    const SupabaseClient = getSupabaseForUser(token);
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const { data: orders, error } = await SupabaseClient
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json({ success: true, orders: orders ?? [] });
  } catch (error) {
    return handleApiError(error, "Orders GET", "Failed to fetch orders");
  }
}

// POST - Create new order via checkout RPC
export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const { allowed } = checkRateLimit(`orders:${ip}`);

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
    const SupabaseClient = getSupabaseForUser(token);
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const {
      cart_id,
      shipping_address,
      billing_address,
      gift_wrap,
      gift_note,
      customer_note,
      shipping_fee,
      payment_method,
    } = await request.json();

    if (!cart_id) {
      return Response.json(
        { success: false, message: "cart_id is required" },
        { status: 400 }
      );
    }

    if (!shipping_address) {
      return Response.json(
        { success: false, message: "Shipping address is required" },
        { status: 400 }
      );
    }

    // Use the checkout RPC — handles all validation, stock, pricing, coupon, order+items creation
    const { data: order, error: checkoutError } = await SupabaseClient
      .rpc("checkout", {
        p_cart_id: cart_id,
        p_shipping_address: shipping_address,
        p_billing_address: billing_address || null,
        p_gift_wrap: gift_wrap || false,
        p_gift_note: gift_note || null,
        p_customer_note: customer_note || null,
        p_shipping_fee: shipping_fee || 0,
      });

    if (checkoutError) {
      logger.error("[Checkout RPC Error]", checkoutError);
      return Response.json(
        { success: false, message: checkoutError.message || "Checkout failed" },
        { status: 400 }
      );
    }

    if (!order || !order.id) {
      return Response.json(
        { success: false, message: "Checkout returned no order" },
        { status: 500 }
      );
    }

    // Handle COD payment
    if (payment_method === "cod") {
      const { error: codError } = await SupabaseClient
        .rpc("pay_with_cod", { p_order_id: order.id });

      if (codError) {
        logger.error("[COD Payment Error]", codError);
        // Order created but COD recording failed — still return success with order
      }
    }

    // Send confirmation email (non-blocking)
    try {
      const { sendOrderConfirmation } = await import("@/lib/email");
      await sendOrderConfirmation({
        orderId: order.id,
        customerName: shipping_address.full_name || "Customer",
        customerEmail: shipping_address.email || "",
        items: [],
        subtotal: order.subtotal || 0,
        shipping: order.shipping_fee || 0,
        total: order.total || 0,
        shippingAddress: shipping_address,
      });
    } catch (emailError) {
      logger.error("[Email Error]", emailError);
    }

    return Response.json({
      success: true,
      order_id: order.id,
      order_number: order.order_number,
      total: order.total,
      payment_method: payment_method || "cod",
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Orders POST", "Failed to create order");
  }
}
