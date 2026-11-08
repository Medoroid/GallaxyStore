import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import {
  computeCouponDiscount,
  computeOrderTotal,
  couponValidationError,
  findShippingOption,
  roundMoney,
} from "@/lib/checkout-calculations";
import { normaliseCountryCode } from "@/lib/shippingCountry";
import {
  isShippingWeightEnabled,
  fetchWeightGramsForItems,
} from "@/lib/shippingWeight";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

function json(message, status) {
  return Response.json({ success: false, message }, { status });
}

function uuid(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(candidate) ? candidate : null;
}

function normalizeCountry(value) {
  const country = typeof value === "string" ? value.trim() : "";
  return country.length >= 2 && country.length <= 80 ? country : null;
}

/**
 * POST /api/checkout/preview
 *
 * The browser sends only the cart id, destination and selected shipping method.
 * Prices, coupon rules, tax, gift-wrap and shipping are all resolved on the
 * server. The checkout RPC remains the final authority; this endpoint exists so
 * the confirmation screen shows the same breakdown before the order is placed.
 */
export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`checkout-preview:${ip}`, {
      maxRequests: 60,
      windowMs: 60_000,
      failureMode: "fail_open",
    });
    if (!allowed) return json("Too many requests. Please try again shortly.", 429);

    const authHeader = request.headers.get("authorization");
    if (!authHeader) return json("Authorization required", 401);

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json("Authorization required", 401);

    const userClient = getSupabaseForUser(token);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(token);
    if (authError || !user) return json("Invalid token", 401);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json("Invalid request body", 400);

    const cartId = uuid(body.cart_id);
    if (!cartId) return json("A valid cart id is required", 400);

    const shippingAddress =
      body.shipping_address && typeof body.shipping_address === "object"
        ? body.shipping_address
        : {};
    // B6/B4 — map the form's country NAME ("Egypt") to the ISO code the
    // shipping zone lookup matches against ("EG").
    const country = normaliseCountryCode(
      normalizeCountry(body.country || shippingAddress.country)
    );
    if (!country) return json("A destination country is required", 400);

    const { data: cart, error: cartError } = await userClient
      .from("carts")
      .select("id, owner_id, status, currency, coupon_id, coupon_code, discount_amount")
      .eq("id", cartId)
      .maybeSingle();

    if (cartError) throw cartError;
    if (!cart || cart.owner_id !== user.id || cart.status !== "active") {
      return json("Cart not found or access denied", 404);
    }

    const { data: detailedItems, error: itemsError } = await userClient
      .from("cart_items_detailed")
      .select(
        "id, variant_id, quantity, unit_price_snapshot, current_price, price_changed_since_added, available_stock, product_name, color, size"
      )
      .eq("cart_id", cartId)
      .eq("is_saved_for_later", false);

    if (itemsError) throw itemsError;

    const items = detailedItems ?? [];
    if (items.length === 0) return json("Your cart is empty", 400);

    const { data: giftItems, error: giftError } = await userClient
      .from("cart_items")
      .select("id, is_gift_wrapped")
      .eq("cart_id", cartId)
      .eq("is_saved_for_later", false);

    if (giftError) throw giftError;
    const giftWrappedIds = new Set(
      (giftItems ?? []).filter((item) => item.is_gift_wrapped).map((item) => item.id)
    );

    let subtotal = 0;
    const priceChanges = [];
    const stockIssues = [];

    for (const item of items) {
      const unitPrice = roundMoney(item.current_price ?? item.unit_price_snapshot);
      const quantity = Number(item.quantity || 0);
      subtotal = roundMoney(subtotal + unitPrice * quantity);

      if (item.price_changed_since_added) {
        priceChanges.push({
          cart_item_id: item.id,
          product_name: item.product_name,
          old_price: roundMoney(item.unit_price_snapshot),
          new_price: unitPrice,
        });
      }

      const available = Number(item.available_stock ?? 0);
      if (available < quantity) {
        stockIssues.push({
          cart_item_id: item.id,
          product_name: item.product_name,
          requested: quantity,
          available,
        });
      }
    }

    const db = getServiceRoleClient();
    let coupon = null;
    let couponError = null;
    let discount = 0;
    let userUseCount = 0;

    if (cart.coupon_id || cart.coupon_code) {
      const couponQuery = db
        .from("coupons")
        .select(
          "id, code, type, value, min_order_amount, max_discount_amount, max_uses, max_uses_per_user, used_count, starts_at, expires_at, is_active"
        );

      const { data: couponRow, error: couponQueryError } = cart.coupon_id
        ? await couponQuery.eq("id", cart.coupon_id).maybeSingle()
        : await couponQuery.eq("code", String(cart.coupon_code).toUpperCase()).maybeSingle();

      if (couponQueryError) throw couponQueryError;
      coupon = couponRow ?? null;

      if (coupon) {
        const { count, error: countError } = await db
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("coupon_id", coupon.id)
          .neq("status", "cancelled");

        if (countError) {
          // The checkout RPC will re-check this. Do not show a discount that
          // may be rejected at the final step.
          logger.warn(
            "[checkout-preview] coupon usage lookup failed",
            countError.message
          );
          couponError = "Could not verify this coupon. Please try again.";
        } else {
          userUseCount = Number(count ?? 0);
        }
      }

      if (!couponError) {
        couponError = couponValidationError(coupon, subtotal, userUseCount);
      }
      if (!couponError) discount = computeCouponDiscount(coupon, subtotal);
    }

    // B6 — resolve the real package weight from the database (gated until
    // checkout() validates weight-adjusted fees; see manual-review/05_*.sql).
    let weightGrams = 0;
    if (isShippingWeightEnabled()) {
      try {
        weightGrams = await fetchWeightGramsForItems(
          userClient,
          items.map((item) => ({
            variant_id: item.variant_id,
            quantity: Number(item.quantity || 1),
          }))
        );
      } catch (weightError) {
        logger.warn(
          "[checkout-preview] weight lookup failed",
          weightError instanceof Error ? weightError.message : "unknown error"
        );
        return json("Could not calculate shipping. Please try again.", 503);
      }
    }

    const [taxResult, giftFeeResult, shippingResult] = await Promise.all([
      userClient.rpc("calculate_tax", {
        p_subtotal: subtotal,
        p_shipping_address: { ...shippingAddress, country },
      }),
      userClient.rpc("gift_wrap_fee"),
      userClient.rpc("get_shipping_options", {
        p_country: country,
        p_order_subtotal: subtotal,
        p_weight_grams: weightGrams,
      }),
    ]);

    // These values are written by the checkout RPC. Showing a silent 0 when a
    // pricing RPC fails would make the displayed total differ from the order.
    if (taxResult.error) {
      logger.warn("[checkout-preview] tax calculation failed", taxResult.error.message);
      return json("Could not calculate tax. Please try again.", 503);
    }
    const tax = Math.max(0, roundMoney(taxResult.data ?? 0));

    let giftWrapUnitFee = 0;
    if (giftFeeResult.error) {
      logger.warn("[checkout-preview] gift wrap fee failed", giftFeeResult.error.message);
      if (giftWrappedIds.size > 0) {
        return json("Could not calculate gift wrapping. Please try again.", 503);
      }
    } else {
      giftWrapUnitFee = Math.max(0, roundMoney(giftFeeResult.data ?? 0));
    }
    const giftWrapFee = roundMoney(giftWrapUnitFee * giftWrappedIds.size);

    if (shippingResult.error) {
      logger.warn("[checkout-preview] shipping options failed", shippingResult.error.message);
      return json("Could not calculate shipping. Please try again.", 503);
    }
    const shippingOptions = (shippingResult.data ?? []).map((option) => ({
      method_id: option.method_id,
      method_name: option.method_name,
      method_type: option.method_type,
      carrier: option.carrier,
      fee: roundMoney(option.fee),
      is_free: Boolean(option.is_free),
      min_delivery_days: option.min_delivery_days,
      max_delivery_days: option.max_delivery_days,
    }));

    const requestedMethodId = uuid(body.shipping_method_id);
    const selected =
      findShippingOption(shippingOptions, requestedMethodId) ??
      shippingOptions[0] ??
      null;
    const shippingFee = selected ? roundMoney(selected.fee) : 0;

    const total = computeOrderTotal({
      subtotal,
      tax,
      shipping: shippingFee,
      giftWrap: giftWrapFee,
      discount,
    });

    return Response.json({
      success: true,
      cart_id: cartId,
      currency: cart.currency || "USD",
      item_count: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      subtotal,
      discount,
      stored_discount: roundMoney(cart.discount_amount),
      tax,
      shipping_fee: shippingFee,
      gift_wrap_fee: giftWrapFee,
      gift_wrap_item_count: giftWrappedIds.size,
      total,
      items: items.map((item) => ({
        cart_item_id: item.id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        quantity: Number(item.quantity || 0),
        unit_price: roundMoney(item.current_price ?? item.unit_price_snapshot),
        color: item.color,
        size: item.size,
      })),
      coupon: coupon
        ? {
            id: coupon.id,
            code: coupon.code,
            valid: !couponError,
            error: couponError,
          }
        : null,
      coupon_error: couponError,
      price_changes: priceChanges,
      stock_issues: stockIssues,
      shipping_options: shippingOptions,
      selected_shipping_method_id: selected?.method_id ?? null,
      selected_shipping_method: selected,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/checkout/preview");
  }
}
