import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

// GET - Track order by order id/number + the authenticated account email.
// Both factors are required; a guessed order number alone never reveals data.
export async function GET(request) {
  try {
    const ip = getClientIp(request);
    const { searchParams } = new URL(request.url);
    const orderRef = (searchParams.get("order_id") || searchParams.get("order_number") || "").trim();
    const email = normaliseEmail(searchParams.get("email"));

    if (!orderRef || !email) {
      return Response.json(
        { success: false, message: "Order number and email are required" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return Response.json({ success: false, message: "Invalid email" }, { status: 400 });
    }

    // Track-order is a public lookup. Limit by IP only (not by order reference,
    // which an attacker can rotate) and keep the budget low to stop enumeration.
    const { allowed } = await checkRateLimitAsync(`track:${ip}`, {
      windowMs: 10 * 60 * 1000,
      maxRequests: 10,
      failureMode: "fail_closed",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many attempts. Please try again in a few minutes." },
        { status: 429 }
      );
    }

    const db = getServiceRoleClient();

    let query = db
      .from("orders")
      .select(
        "id, order_number, user_id, status, subtotal, tax, shipping_fee, discount_amount, total, currency, shipping_address_snapshot, placed_at, created_at"
      )
      .is("deleted_at", null)
      .limit(1);

    query = UUID_RE.test(orderRef)
      ? query.eq("id", orderRef)
      : query.eq("order_number", orderRef);

    const { data: order, error } = await query.maybeSingle();

    // Same response for "not found" and "wrong email" to prevent enumeration.
    if (error) {
      logger.warn("[Track Order] lookup failed:", error.message);
      return Response.json({ success: false, message: "Order not found" }, { status: 404 });
    }
    if (!order) {
      return Response.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    const { data: userResult, error: userError } = await db.auth.admin.getUserById(order.user_id);
    if (userError || !userResult?.user?.email) {
      logger.warn("[Track Order] could not resolve order email", { orderId: order.id });
      return Response.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    if (normaliseEmail(userResult.user.email) !== email) {
      return Response.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    const { data: items, error: itemsError } = await db
      .from("order_items")
      .select("product_name_snapshot, sku_snapshot, quantity, unit_price_snapshot, line_total, status")
      .eq("order_id", order.id);

    if (itemsError) {
      logger.warn("[Track Order] items lookup failed:", itemsError.message);
      return Response.json(
        { success: false, message: "Could not load this order right now" },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        subtotal: order.subtotal,
        tax: order.tax,
        shipping_fee: order.shipping_fee,
        discount_amount: order.discount_amount,
        total: order.total,
        currency: order.currency,
        placed_at: order.placed_at || order.created_at,
        shipping_address_snapshot: order.shipping_address_snapshot,
        items: items || [],
      },
    });
  } catch (error) {
    logger.error("[Track Order] unexpected error", error);
    return Response.json({ success: false, message: "Could not track this order" }, { status: 500 });
  }
}
