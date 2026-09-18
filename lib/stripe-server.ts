import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripeServer() {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeInstance;
}
