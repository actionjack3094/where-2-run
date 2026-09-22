import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  customerIdOf,
  getStripe,
  getStripeWebhookSecret,
  paymentMethodIdOf,
} from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETUP_INTENT_EVENTS = new Set<Stripe.Event.Type>([
  "setup_intent.succeeded",
  "setup_intent.setup_failed",
  "setup_intent.canceled",
]);

function stripeSignature(request: Request) {
  return request.headers.get("stripe-signature");
}

async function applySetupIntent(intent: Stripe.SetupIntent) {
  const admin = createAdminClient();
  const paymentMethodId = paymentMethodIdOf(intent.payment_method);
  const customerId = customerIdOf(intent.customer);

  const nextStatus =
    intent.status === "canceled"
      ? "canceled"
      : intent.status === "requires_payment_method" && intent.last_setup_error
        ? "failed"
        : "pending";

  const { error } = await admin
    .from("campaign_pledges")
    .update({
      stripe_payment_method_id: paymentMethodId,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_setup_intent_id", intent.id);

  if (error && !isMissingRelation(error)) {
    throw new Error(error.message);
  }
}

export async function POST(request: Request) {
  const signature = stripeSignature(request);
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  // App Router does not JSON-parse this body. Read the raw payload so
  // Stripe can verify the signature — the Pages Router equivalent of
  // `bodyParser: false`.
  const payload = await request.text();

  let stripe: ReturnType<typeof getStripe>;
  let webhookSecret: string;
  try {
    stripe = getStripe();
    webhookSecret = getStripeWebhookSecret();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe webhook is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Stripe signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (SETUP_INTENT_EVENTS.has(event.type)) {
      await applySetupIntent(event.data.object as Stripe.SetupIntent);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook handler failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
