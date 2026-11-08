import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  isExternalWalletConfigured,
  loadExternalWalletSettings,
  normalizeCheckoutPaymentMethod,
} from "@/lib/payment-settings";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { isMissingRpcError } from "@/lib/supabase/rpc-errors";
import { getExternalWalletPaymentCapability } from "@/lib/payment-capabilities";
import { normaliseCountryCode } from "@/lib/shippingCountry";
import {
  isShippingWeightEnabled,
  fetchWeightGramsForItems,
} from "@/lib/shippingWeight";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// GET - Fetch user's orders
export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ success: false, message: "Authorization required" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);
    const {
      data: { user },
      error: authError,
    } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ success: false, message: "Invalid token" }, { status: 401 });
    }

    const { data: orders, error } = await SupabaseClient
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // A small payment summary per order so the list can tell the customer
    // whether a transfer is awaiting verification, rejected or confirmed —
    // without a second request per order. The user-JWT client keeps RLS as the
    // ownership gate: only this user's own payment rows are readable.
    const rows = orders ?? [];
    const paymentSummaryByOrder = new Map();
    if (rows.length > 0) {
      const { data: payments, error: paymentsError } = await SupabaseClient
        .from("payments")
        .select("order_id, provider, status, created_at")
        .in("order_id", rows.map((order) => order.id))
        .order("created_at", { ascending: false });

      if (paymentsError) {
        // The list must still load; the badge is simply omitted.
        logger.warn("[Orders GET] payments lookup failed:", paymentsError.message);
      } else {
        for (const payment of payments ?? []) {
          const existing = paymentSummaryByOrder.get(payment.order_id);
          // A settled attempt beats the newest retry (same rule as order pages).
          if (!existing || (existing.status !== "succeeded" && payment.status === "succeeded")) {
            paymentSummaryByOrder.set(payment.order_id, {
              provider: payment.provider,
              status: payment.status,
            });
          }
        }
      }
    }

    return Response.json({
      success: true,
      orders: rows.map((order) => ({
        ...order,
        payment_summary: paymentSummaryByOrder.get(order.id) ?? null,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Orders GET", "Failed to fetch orders");
  }
}

// POST - Create new order via checkout RPC
export async function POST(request) {
  const ip = getClientIp(request);
  // Checkout creates orders and payment rows: if the shared store is down,
  // reject rather than let an unprotected burst through.
  const { allowed } = await checkRateLimitAsync(`orders:${ip}`, {
    maxRequests: 10,
    failureMode: "fail_closed",
  });

  if (!allowed) {
    return Response.json(
      { success: false, message: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ success: false, message: "Authorization required" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);
    const {
      data: { user },
      error: authError,
    } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ success: false, message: "Invalid token" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      cart_id,
      shipping_address,
      billing_address,
      gift_wrap,
      gift_note,
      customer_note,
      payment_method,
      shipping_method_id,
    } = body || {};

    if (!cart_id || !UUID_RE.test(String(cart_id))) {
      return Response.json({ success: false, message: "A valid cart_id is required" }, { status: 400 });
    }

    const { data: cartRow, error: cartError } = await SupabaseClient
      .from("carts")
      .select("id, owner_id, status, coupon_code")
      .eq("id", cart_id)
      .maybeSingle();

    if (cartError) throw cartError;
    if (!cartRow || cartRow.owner_id !== user.id || cartRow.status !== "active") {
      return Response.json(
        { success: false, message: "Cart not found or access denied" },
        { status: 404 }
      );
    }

    // The checkout page syncs the cart immediately before this request. If a
    // caller skipped that step and prices or stock moved, stop instead of
    // silently charging a different amount than the preview showed.
    const { data: cartItems, error: cartItemsError } = await SupabaseClient
      .from("cart_items_detailed")
      .select(
        "id, product_name, quantity, unit_price_snapshot, current_price, price_changed_since_added, available_stock"
      )
      .eq("cart_id", cart_id)
      .eq("is_saved_for_later", false);

    if (cartItemsError) throw cartItemsError;

    const changedPrices = (cartItems ?? []).filter((item) => item.price_changed_since_added);
    if (changedPrices.length > 0) {
      return Response.json(
        {
          success: false,
          message:
            "Some item prices changed. Please review your cart and refresh the totals before placing the order.",
        },
        { status: 409 }
      );
    }

    const stockProblems = (cartItems ?? []).filter(
      (item) => Number(item.available_stock ?? 0) < Number(item.quantity ?? 0)
    );
    if (stockProblems.length > 0) {
      return Response.json(
        {
          success: false,
          message: `Some items are no longer available in the requested quantity: ${stockProblems
            .map((item) => item.product_name || "Item")
            .join(", ")}`,
        },
        { status: 409 }
      );
    }

    // Re-apply the coupon against the freshly synced cart. The live checkout RPC
    // reads carts.discount_amount; without this refresh a coupon applied before
    // the last quantity change would use a stale discount.
    if (cartRow.coupon_code) {
      const { error: couponRefreshError } = await SupabaseClient.rpc("apply_coupon", {
        p_cart_id: cart_id,
        p_code: cartRow.coupon_code,
      });
      if (couponRefreshError) {
        return Response.json(
          { success: false, message: couponRefreshError.message || "Coupon is no longer valid" },
          { status: 400 }
        );
      }
    }

    if (!shipping_address || typeof shipping_address !== "object") {
      return Response.json({ success: false, message: "Shipping address is required" }, { status: 400 });
    }

    // The browser may choose a method, but the server decides which methods
    // exist and never accepts an amount, currency or owner from the request.
    const requestedPaymentMethod = normalizeCheckoutPaymentMethod(payment_method);
    if (!requestedPaymentMethod) {
      return Response.json(
        {
          success: false,
          message:
            "That payment method is not available. Choose cash on delivery or a mobile wallet transfer.",
        },
        { status: 400 }
      );
    }

    if (requestedPaymentMethod === "external_wallet") {
      const db = getServiceRoleClient();
      try {
        const walletSettings = await loadExternalWalletSettings(db);
        if (!isExternalWalletConfigured(walletSettings)) {
          return Response.json(
            {
              success: false,
              message:
                "Wallet transfers are not configured yet. Choose cash on delivery or contact support.",
            },
            { status: 409 }
          );
        }
      } catch (settingsError) {
        logger.warn("[Orders POST] wallet settings unavailable:", settingsError.message);
        return Response.json(
          {
            success: false,
            message:
              "Wallet transfers are temporarily unavailable. Choose cash on delivery or try again later.",
          },
          { status: 503 }
        );
      }

      // Settings can exist before the payment migration. Check the RPCs before
      // creating an order so the customer never receives an unusable order.
      const capability = await getExternalWalletPaymentCapability(db);
      if (!capability.available) {
        return Response.json(
          {
            success: false,
            message:
              capability.reason ||
              "Wallet transfers are not available on this deployment. Choose cash on delivery.",
          },
          { status: 409 }
        );
      }
    }

    const email = typeof shipping_address.email === "string" ? shipping_address.email.trim() : "";
    if (!EMAIL_RE.test(email)) {
      return Response.json(
        { success: false, message: "A valid email address is required for the order confirmation" },
        { status: 400 }
      );
    }

    if (
      typeof shipping_address.full_name !== "string" ||
      !shipping_address.full_name.trim() ||
      typeof shipping_address.phone !== "string" ||
      !shipping_address.phone.trim()
    ) {
      return Response.json(
        { success: false, message: "Full name and phone are required" },
        { status: 400 }
      );
    }

    // Shipping fee is derived from shipping_rates, not from the request body.
    // The destination determines which methods exist; if any exist, the caller
    // must pick one so an omitted method cannot silently mean free shipping.
    let trustedShippingFee = 0;
    {
      const { data: totals, error: totalsError } = await SupabaseClient
        .from("cart_totals")
        .select("subtotal")
        .eq("cart_id", cart_id)
        .maybeSingle();

      if (totalsError) {
        logger.warn("[Orders POST] cart totals lookup failed:", totalsError.message);
        return Response.json(
          { success: false, message: "Could not calculate your cart total. Please try again." },
          { status: 503 }
        );
      }

      const subtotal = Number(totals?.subtotal ?? 0);
      // B6/B4 — map the address country NAME ("Egypt") to the ISO code the
      // shipping zone lookup matches ("EG"). Unknown values fall through to
      // the default zone (rest of world), which is the correct behaviour.
      const country =
        normaliseCountryCode(shipping_address.country) || "EG";

      // B6 — resolve the real package weight from THIS user's cart (gated
      // until the checkout RPC accepts weight-adjusted fees; see
      // supabase/manual-review/05_checkout_weight_shipping_fee.sql).
      let weightGrams = 0;
      if (isShippingWeightEnabled()) {
        const { data: cartRows, error: cartWeightError } = await SupabaseClient
          .from("cart_items")
          .select("variant_id, quantity")
          .eq("cart_id", cart_id)
          .eq("is_saved_for_later", false);

        if (cartWeightError) {
          logger.warn("[Orders POST] cart weight lookup failed:", cartWeightError.message);
          return Response.json(
            { success: false, message: "Could not calculate shipping. Please try again." },
            { status: 503 }
          );
        }

        try {
          weightGrams = await fetchWeightGramsForItems(
            SupabaseClient,
            (cartRows ?? []).map((row) => ({
              variant_id: row.variant_id,
              quantity: Number(row.quantity || 1),
            }))
          );
        } catch (weightError) {
          logger.warn(
            "[Orders POST] weight resolution failed:",
            weightError instanceof Error ? weightError.message : "unknown error"
          );
          return Response.json(
            { success: false, message: "Could not calculate shipping. Please try again." },
            { status: 503 }
          );
        }
      }

      const { data: options, error: shippingError } = await SupabaseClient.rpc(
        "get_shipping_options",
        { p_country: country, p_order_subtotal: subtotal, p_weight_grams: weightGrams }
      );

      if (shippingError) {
        logger.warn("[Orders POST] shipping lookup failed:", shippingError.message);
        return Response.json(
          { success: false, message: "Could not calculate shipping. Please try again." },
          { status: 400 }
        );
      }

      const availableOptions = Array.isArray(options) ? options : [];

      if (shipping_method_id) {
        const selected = availableOptions.find(
          (option) => option.method_id === shipping_method_id
        );
        if (!selected) {
          return Response.json(
            {
              success: false,
              message: "The selected shipping method is not available for this address",
            },
            { status: 400 }
          );
        }
        trustedShippingFee = Number(selected.fee || 0);
      } else if (availableOptions.length > 0) {
        return Response.json(
          { success: false, message: "Please choose a shipping method" },
          { status: 400 }
        );
      }
    }

    // The checkout RPC re-prices everything from product variants, validates
    // stock, coupon rules and enforces a single currency for the order.
    const { data: order, error: checkoutError } = await SupabaseClient.rpc("checkout", {
      p_cart_id: cart_id,
      p_shipping_address: shipping_address,
      p_billing_address: billing_address || null,
      p_gift_wrap: gift_wrap || false,
      p_gift_note: gift_note || null,
      p_customer_note: customer_note || null,
      p_shipping_fee: trustedShippingFee,
    });

    if (checkoutError) {
      logger.error("[Checkout RPC Error]", checkoutError);
      return Response.json(
        { success: false, message: checkoutError.message || "Checkout failed" },
        { status: 400 }
      );
    }

    if (!order || !order.id) {
      return Response.json({ success: false, message: "Checkout returned no order" }, { status: 500 });
    }

    // Persist the chosen method before starting a payment. A payment for an
    // order with no shipping method would be harder to recover than a pending
    // order the customer can resume from the order page.
    if (shipping_method_id) {
      const { error: shippingError } = await SupabaseClient.rpc("set_order_shipping_method", {
        p_order_id: order.id,
        p_shipping_method_id: shipping_method_id,
      });
      if (shippingError) {
        logger.error("[Orders POST] shipping method not saved:", shippingError.message);
        return Response.json(
          {
            success: false,
            message:
              "Your order was created, but its shipping method could not be saved. Open the order to finish setup or contact support.",
            order_id: order.id,
            order_number: order.order_number,
          },
          { status: 502 }
        );
      }
    }

    // A fully discounted order (coupon covers everything) has nothing to
    // collect. `payments.amount > 0` would reject a COD/wallet row, so a
    // zero-total order is completed as paid instead of being left pending.
    const orderTotal = Number(order.total ?? 0);
    let payment = null;
    let freeOrder = false;

    if (orderTotal <= 0) {
      const { data: completedOrder, error: freeError } = await SupabaseClient.rpc(
        "complete_zero_total_order",
        { p_order_id: order.id }
      );

      if (freeError) {
        if (isMissingRpcError(freeError)) {
          // 20261029 adds complete_zero_total_order. Do not bypass the database
          // business rules with a service-role update; return a recoverable
          // error with the order reference instead.
          logger.error(
            "[Orders POST] complete_zero_total_order is missing; refusing unsafe fallback"
          );
          return Response.json(
            {
              success: false,
              message:
                "Your order was created, but free-order completion is not enabled on this deployment yet. Contact support with your order number.",
              order_id: order.id,
              order_number: order.order_number,
            },
            { status: 503 }
          );
        }

        logger.error("[Orders POST] free order completion failed:", freeError);
        return Response.json(
          {
            success: false,
            message:
              "Your order was created, but it could not be finalised. Contact support with your order number.",
            order_id: order.id,
            order_number: order.order_number,
          },
          { status: 502 }
        );
      }

      if (!completedOrder || completedOrder.status !== "paid") {
        logger.error("[Orders POST] free order completion returned no paid order");
        return Response.json(
          {
            success: false,
            message:
              "Your order was created, but it could not be finalised. Contact support with your order number.",
            order_id: order.id,
            order_number: order.order_number,
          },
          { status: 502 }
        );
      }

      freeOrder = true;
    } else {
      const paymentRpc =
        requestedPaymentMethod === "cod"
          ? "pay_with_cod"
          : "initiate_external_wallet_payment";

      const { data: paymentData, error: paymentError } = await SupabaseClient.rpc(paymentRpc, {
        p_order_id: order.id,
      });

      if (paymentError) {
        // The order exists but its payment attempt does not. Do not pretend the
        // payment started; return the order reference so support can recover it.
        logger.error(`[Orders POST] ${requestedPaymentMethod} payment setup failed:`, paymentError);

        const missingRpc = isMissingRpcError(paymentError);
        return Response.json(
          {
            success: false,
            message: missingRpc
              ? "Your order was created, but this payment method is not enabled on this deployment yet. Open the order to choose cash on delivery or contact support."
              : "Your order was created, but the payment method could not be started. Contact support with your order number.",
            order_id: order.id,
            order_number: order.order_number,
          },
          { status: missingRpc ? 409 : 502 }
        );
      }

      payment = paymentData;
    }

    // Confirmation email uses the persisted order items, never the request body.
    try {
      const { data: orderItems } = await SupabaseClient
        .from("order_items")
        .select("product_name_snapshot, quantity, unit_price_snapshot, line_total")
        .eq("order_id", order.id);

      const { sendOrderConfirmation } = await import("@/lib/email");
      await sendOrderConfirmation({
        orderId: order.id,
        orderNumber: order.order_number,
        customerName: String(shipping_address.full_name).trim(),
        customerEmail: email,
        currency: order.currency,
        items: (orderItems || []).map((item) => ({
          name: item.product_name_snapshot,
          quantity: item.quantity,
          price: Number(item.unit_price_snapshot),
          lineTotal: Number(item.line_total),
        })),
        subtotal: Number(order.subtotal || 0),
        shipping: Number(order.shipping_fee || 0),
        tax: Number(order.tax || 0),
        discount: Number(order.discount_amount || 0),
        total: Number(order.total || 0),
        shippingAddress: {
          full_name: shipping_address.full_name,
          address: shipping_address.address,
          city: shipping_address.city,
          country: shipping_address.country,
        },
      });
    } catch (emailError) {
      // Email is best-effort: order creation must not fail because of Resend.
      logger.error("[Email Error]", emailError);
    }

    return Response.json(
      {
        success: true,
        order_id: order.id,
        order_number: order.order_number,
        total: order.total,
        currency: order.currency,
        payment_method: requestedPaymentMethod,
        payment_id: payment?.id ?? null,
        payment_status: freeOrder ? "paid" : (payment?.status ?? "pending"),
        free_order: freeOrder,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "Orders POST", "Failed to create order");
  }
}
