import { logger } from "@/lib/logger";

/**
 * Stripe webhooks are acknowledged but never settled.
 *
 * Stripe retries non-2xx responses, so a 410 would keep an obsolete endpoint
 * noisy for days. A 200 with `ignored: true` stops retries while guaranteeing
 * that no order can be marked paid by a legacy event.
 */
export async function POST() {
  logger.warn("[Stripe Webhook] event ignored while card payments are disabled");
  return Response.json(
    {
      received: true,
      ignored: true,
      settled: false,
      message: "Card payments are disabled; no order was modified.",
    },
    { status: 200 }
  );
}

export async function GET() {
  return Response.json(
    { enabled: false, message: "Stripe webhooks are disabled on this deployment." },
    { status: 410 }
  );
}
