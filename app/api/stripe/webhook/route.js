import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { logger } from "@/lib/logger";

let stripeInstance = null;
let supabaseInstance = null;

function getStripe() {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  stripeInstance = new Stripe(key);
  return stripeInstance;
}

function getSupabase() {
  if (supabaseInstance) return supabaseInstance;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  supabaseInstance = createClient(url, key);
  return supabaseInstance;
}

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not set");
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!signature) {
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    logger.error("[Stripe Webhook] Signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getSupabase();

  // Idempotency: check if event already processed
  const { data: existing } = await db
    .from("payment_events")
    .select("id")
    .eq("provider_event_id", event.id)
    .single();

  if (existing) {
    return Response.json({ received: true, message: "Event already processed" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orderId = session.metadata && session.metadata.order_id;

        if (!orderId) {
          logger.error("[Stripe Webhook] No order_id in session metadata");
          break;
        }

        await db.rpc("record_payment_event", {
          p_provider: "stripe",
          p_event_type: event.type,
          p_provider_event_id: event.id,
          p_payload: JSON.parse(JSON.stringify(event)),
          p_signature_verified: true,
          p_payment_id: null,
        });

        const { error } = await db.rpc("confirm_order_payment", {
          p_order_id: orderId,
          p_provider: "stripe",
          p_provider_payment_id: session.payment_intent || session.id,
          p_amount: (session.amount_total || 0) / 100,
          p_raw_response: JSON.parse(JSON.stringify(session)),
        });

        if (error) {
          logger.error("[Stripe Webhook] confirm_order_payment failed:", error);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;

        await db.rpc("record_payment_event", {
          p_provider: "stripe",
          p_event_type: event.type,
          p_provider_event_id: event.id,
          p_payload: JSON.parse(JSON.stringify(event)),
          p_signature_verified: true,
          p_payment_id: null,
        });

        const lastError = paymentIntent.last_payment_error || {};
        const { error } = await db.rpc("process_payment_failure", {
          p_provider_payment_id: paymentIntent.id,
          p_provider: "stripe",
          p_failure_code: lastError.code || null,
          p_failure_message: lastError.message || null,
          p_raw_response: JSON.parse(JSON.stringify(paymentIntent)),
        });

        if (error) {
          logger.error("[Stripe Webhook] process_payment_failure failed:", error);
        }
        break;
      }

      case "checkout.session.expired": {
        await db.rpc("record_payment_event", {
          p_provider: "stripe",
          p_event_type: event.type,
          p_provider_event_id: event.id,
          p_payload: JSON.parse(JSON.stringify(event)),
          p_signature_verified: true,
          p_payment_id: null,
        });
        break;
      }

      default:
        await db.rpc("record_payment_event", {
          p_provider: "stripe",
          p_event_type: event.type,
          p_provider_event_id: event.id,
          p_payload: JSON.parse(JSON.stringify(event)),
          p_signature_verified: true,
          p_payment_id: null,
        });
    }

    return Response.json({ received: true });
  } catch (err) {
    logger.error("[Stripe Webhook] Error processing event:", err);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
