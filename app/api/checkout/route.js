import { logger } from "@/lib/logger";

/**
 * Card checkout is intentionally disabled.
 *
 * There is no supported card settlement path in this deployment. Creating a
 * Stripe session here would allow a customer to pay through an integration that
 * the admin/wallet flows cannot reconcile, so the endpoint fails explicitly.
 */
export async function POST() {
  logger.warn("[Checkout] card session creation blocked while card payments are disabled");
  return Response.json(
    {
      success: false,
      disabled: true,
      message:
        "Card payments are disabled. Choose cash on delivery or a mobile wallet transfer.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return Response.json(
    { enabled: false, message: "Card payments are disabled on this deployment." },
    { status: 410 }
  );
}
