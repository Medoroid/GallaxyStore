import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { getStripeServer } from "@/lib/stripe-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const { allowed } = checkRateLimit(`checkout:${ip}`);

  if (!allowed) {
    return Response.json(
      { success: false, message: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const SupabaseClient = getServiceRoleClient();
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

    const { order_id, order_number, items, total, currency } = await request.json();

    if (!order_id) {
      return Response.json(
        { success: false, message: "order_id is required" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json(
        { success: false, message: "Items are required" },
        { status: 400 }
      );
    }

    // Verify the order belongs to this user
    const { data: order, error: orderError } = await SupabaseClient
      .from("orders")
      .select("id, user_id, total, status")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return Response.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    if (order.user_id !== user.id) {
      return Response.json(
        { success: false, message: "Access denied" },
        { status: 403 }
      );
    }

    if (order.status !== "pending") {
      return Response.json(
        { success: false, message: "Order is not in pending state" },
        { status: 400 }
      );
    }

    const stripe = getStripeServer();

    const line_items = items.map((item) => ({
      price_data: {
        currency: currency || "usd",
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round((item.price || 0) * 100),
      },
      quantity: item.quantity || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items,
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/cancel`,
      metadata: {
        order_id: order.id,
        order_number: order_number || "",
        user_id: user.id,
      },
    });

    return Response.json({ success: true, sessionId: session.id, url: session.url });
  } catch (error) {
    return handleApiError(error, "Checkout POST", "Failed to create checkout session");
  }
}
