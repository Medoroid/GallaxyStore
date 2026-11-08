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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// POST - Owner starts (or resumes) the payment for an order that was created
// but whose payment attempt failed, e.g. after a transient error. It never
// settles the payment: COD stays pending until the courier is paid and a wallet
// transfer still needs an admin-approved receipt.
export async function POST(request, { params }) {
  const ip = getClientIp(request);
  const { allowed } = await checkRateLimitAsync(`order-payment:${ip}`, {
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

    const { id } = await params;
    if (!id || !UUID_RE.test(String(id))) {
      return Response.json({ success: false, message: "A valid order ID is required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedPaymentMethod = normalizeCheckoutPaymentMethod(body?.payment_method);
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

    // RLS already restricts this to the owner; the explicit filter keeps the
    // ownership rule obvious and returns a clean 404. Only select columns that
    // exist both before and after the payment migration.
    const { data: order, error: orderError } = await SupabaseClient
      .from("orders")
      .select("id, order_number, status, total, currency, user_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) {
      return Response.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    const orderTotal = Number(order.total ?? 0);

    // Idempotent retry: a zero-total order that already completed as paid has
    // nothing to collect and no payment row. Return the same success shape
    // without touching the order.
    if (order.status === "paid" && orderTotal === 0) {
      return Response.json({
        success: true,
        order_id: id,
        free_order: true,
        payment_method: requestedPaymentMethod,
        payment_id: null,
        payment_status: "paid",
      });
    }

    if (order.status !== "pending") {
      return Response.json(
        { success: false, message: "This order is not awaiting payment." },
        { status: 400 }
      );
    }

    // Free order: complete it instead of trying to create a 0-amount payment.
    if (orderTotal <= 0) {
      const { data: completedOrder, error: freeError } = await SupabaseClient.rpc(
        "complete_zero_total_order",
        { p_order_id: id }
      );

      if (freeError) {
        if (isMissingRpcError(freeError)) {
          // 20261029 adds complete_zero_total_order. Do not bypass the database
          // business rules with a service-role update; leave the order pending
          // and return a recoverable error instead.
          logger.error(
            "[Order Payment POST] complete_zero_total_order is missing; refusing unsafe fallback"
          );
          return Response.json(
            {
              success: false,
              message:
                "This order has no amount due, but free-order completion is not enabled on this deployment yet. Contact support with your order number.",
              order_id: id,
              order_number: order.order_number,
            },
            { status: 503 }
          );
        }

        logger.error("[Order Payment POST] free order completion failed:", freeError);
        return Response.json(
          { success: false, message: freeError.message || "Could not finalise this order" },
          { status: 400 }
        );
      }

      if (!completedOrder || completedOrder.status !== "paid") {
        logger.error("[Order Payment POST] free order completion returned no paid order");
        return Response.json(
          { success: false, message: "Could not finalise this order" },
          { status: 502 }
        );
      }

      return Response.json({
        success: true,
        order_id: id,
        free_order: true,
        payment_method: requestedPaymentMethod,
        payment_id: null,
        payment_status: "paid",
      });
    }

    if (requestedPaymentMethod === "external_wallet") {
      try {
        const walletSettings = await loadExternalWalletSettings(getServiceRoleClient());
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
        logger.warn("[Order Payment POST] wallet settings unavailable:", settingsError.message);
        return Response.json(
          {
            success: false,
            message:
              "Wallet transfers are temporarily unavailable. Choose cash on delivery or try again later.",
          },
          { status: 503 }
        );
      }

      const capability = await getExternalWalletPaymentCapability(getServiceRoleClient());
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

    const paymentRpc =
      requestedPaymentMethod === "cod" ? "pay_with_cod" : "initiate_external_wallet_payment";

    const { data: payment, error: paymentError } = await SupabaseClient.rpc(paymentRpc, {
      p_order_id: id,
    });

    if (paymentError) {
      logger.error(`[Order Payment POST] ${requestedPaymentMethod} setup failed:`, paymentError);
      const message = String(paymentError.message || "");
      const conflict = /already paid|in progress|not awaiting payment/i.test(message);
      return Response.json(
        { success: false, message: paymentError.message || "Could not start the payment." },
        { status: conflict ? 409 : 400 }
      );
    }

    return Response.json({
      success: true,
      order_id: id,
      free_order: false,
      payment_method: requestedPaymentMethod,
      payment_id: payment?.id ?? null,
      payment_status: payment?.status ?? "pending",
    });
  } catch (error) {
    return handleApiError(error, "Order Payment POST", "Failed to start the payment");
  }
}
