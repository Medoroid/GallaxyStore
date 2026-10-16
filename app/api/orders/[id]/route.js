import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

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
    const SupabaseClient = getSupabaseForUser(token);
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

    // Payment attempts (RLS: owner only). Needed by the Vodafone Cash panel
    // so the customer can see the state and submit/re-submit a receipt.
    const { data: payments, error: paymentsError } = await SupabaseClient
      .from("payments")
      .select("id, provider, status, amount, currency, provider_payment_id, raw_response, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false });

    if (paymentsError) {
      logger.warn("[Order GET] payments lookup failed:", paymentsError.message);
    }

    const attempts = payments ?? [];
    const payment = attempts.find((p) => p.status === "succeeded") ?? attempts[0] ?? null;

    // Delivery option (express vs standard). All reads go through the
    // customer's own JWT, so RLS still decides what they may see.
    const shipping_method = await loadShippingMethod(SupabaseClient, order, logger);

    return Response.json({
      success: true,
      order: { ...order, items: items || [], payment, payments: attempts, shipping_method },
    });
  } catch (error) {
    logger.error("[Order GET Error]", error);
    return Response.json(
      { success: false, message: "Failed to fetch order" },
      { status: 500 }
    );
  }
}

// The delivery option lives on the order (if the column is deployed) or on the
// shipment row. Non-fatal: the page still renders when neither exists.
async function loadShippingMethod(client, order, logger) {
  try {
    let methodId = order.shipping_method_id ?? null;

    if (!methodId) {
      const { data: shipment } = await client
        .from("shipments")
        .select("shipping_method_id, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      methodId = shipment?.shipping_method_id ?? null;
    }

    if (!methodId) return null;

    const { data: method, error } = await client
      .from("shipping_methods")
      .select("id, name, slug, type, carrier, min_delivery_days, max_delivery_days")
      .eq("id", methodId)
      .maybeSingle();

    if (error) {
      logger.warn("[Order GET] shipping method lookup failed:", error.message);
      return null;
    }
    return method;
  } catch (error) {
    logger.warn("[Order GET] shipping method lookup failed:", error.message);
    return null;
  }
}
