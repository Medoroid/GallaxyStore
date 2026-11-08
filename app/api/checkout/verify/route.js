import { logger } from "@/lib/logger";

/**
 * The success-page Stripe lookup is disabled together with card checkout.
 * It must not be possible to settle a new order by replaying a session id.
 */
export async function GET() {
  logger.warn("[Checkout Verify] blocked while card payments are disabled");
  return Response.json(
    {
      success: false,
      disabled: true,
      message: "Card payment verification is disabled on this deployment.",
    },
    { status: 410 }
  );
}
