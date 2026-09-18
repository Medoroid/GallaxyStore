import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { logger } from "@/lib/logger";

let supabaseInstance = null;

function getSupabase() {
  if (supabaseInstance) return supabaseInstance;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  supabaseInstance = createClient(url, key);
  return supabaseInstance;
}

function verifyPaymobHmac(rawBody, hmacSecret) {
  const hmac = crypto.createHmac("sha512", hmacSecret);
  hmac.update(rawBody);
  return hmac.digest("hex");
}

export async function POST(request) {
  const rawBody = await request.text();
  const hmacSecret = process.env.PAYMOB_HMAC_SECRET;

  if (!hmacSecret) {
    logger.error("[Paymob Webhook] PAYMOB_HMAC_SECRET is not set");
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify HMAC signature
  const receivedHmac = request.headers.get("x-paymob-signature") || payload.hmac;
  if (!receivedHmac) {
    logger.error("[Paymob Webhook] Missing HMAC signature");
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  const expectedHmac = verifyPaymobHmac(rawBody, hmacSecret);

  let hmacValid = false;
  try {
    hmacValid = crypto.timingSafeEqual(
      Buffer.from(receivedHmac, "hex"),
      Buffer.from(expectedHmac, "hex")
    );
  } catch {
    hmacValid = false;
  }

  if (!hmacValid) {
    logger.error("[Paymob Webhook] HMAC verification failed");
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getSupabase();

  // Idempotency: check if transaction already processed
  const transactionId = payload.id || payload.transaction_id;
  if (transactionId) {
    const { data: existing } = await db
      .from("payment_events")
      .select("id")
      .eq("provider_event_id", String(transactionId))
      .single();

    if (existing) {
      return Response.json({ received: true, message: "Event already processed" });
    }
  }

  try {
    const order = payload.order;
    const orderId = order?.id || order?.merchant_order_id;
    const success = payload.success === true || payload.success === "true";

    // Record payment event
    await db.rpc("record_payment_event", {
      p_provider: "paymob",
      p_event_type: success ? "payment.success" : "payment.failed",
      p_provider_event_id: String(transactionId || Date.now()),
      p_payload: payload,
      p_signature_verified: true,
      p_payment_id: null,
    });

    if (success && orderId) {
      const { error } = await db.rpc("confirm_order_payment", {
        p_order_id: orderId,
        p_provider: "paymob",
        p_provider_payment_id: String(transactionId),
        p_amount: (order.amount_cents || 0) / 100,
        p_raw_response: payload,
      });

      if (error) {
        logger.error("[Paymob Webhook] confirm_order_payment failed:", error);
      }
    } else if (!success) {
      const { error } = await db.rpc("process_payment_failure", {
        p_provider_payment_id: String(transactionId),
        p_provider: "paymob",
        p_failure_code: payload.error_code || null,
        p_failure_message: payload.message || null,
        p_raw_response: payload,
      });

      if (error) {
        logger.error("[Paymob Webhook] process_payment_failure failed:", error);
      }
    }

    return Response.json({ received: true });
  } catch (err) {
    logger.error("[Paymob Webhook] Error processing event:", err);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
