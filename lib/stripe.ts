import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

export function paymentMethodIdOf(
  value: string | Stripe.PaymentMethod | null | undefined,
) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function dollarsToCents(amount: number) {
  return Math.round(amount * 100);
}
