import { logger } from "@/lib/logger";

/**
 * Paymob is intentionally disabled.
 *
 * There is no server-side Paymob checkout initiation, no amount/currency
 * verification against a persisted order, and no tested HMAC contract in this
 * repository. Accepting a webhook here would allow an unverified integration to
 * mark orders as paid. Keep the endpoint explicit so old webhook configurations
 * fail loudly instead of silently doing nothing.
 */
export async function POST() {
  logger.warn("[Paymob Webhook] received a request while the integration is disabled");
  return Response.json(
    {
      received: false,
      message:
        "Paymob is not enabled on this deployment. Use cash on delivery or a mobile wallet transfer.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return Response.json(
    { enabled: false, message: "Paymob is not enabled on this deployment." },
    { status: 410 }
  );
}
