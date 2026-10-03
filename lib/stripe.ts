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

export function customerIdOf(
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function dollarsToCents(amount: number) {
  return Math.round(amount * 100);
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }
  return secret;
}

export function getStripePublishableKey() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  }
  return key;
}

/** First and last name from a verified Identity document, joined for `legal_name`. */
export function verifiedLegalName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
) {
  return [firstName, lastName]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}
