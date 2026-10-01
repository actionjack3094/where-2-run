import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isUuid } from "@/lib/arena/display";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { ALIGNMENT_STREAK_UNLOCK_CONDITION } from "@/lib/escrow";
import { notifyPledgeFunded } from "@/lib/notifications/inbox";
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

function metadataValue(metadata: Stripe.Metadata | null | undefined, key: string) {
  return metadata?.[key]?.trim() ?? "";
}

/**
 * A paid Checkout Session becomes one pending `campaign_pledges` row.
 * `stripe_session_id` is unique, so a retried webhook does not insert twice
 * or alert the candidate twice.
 */
async function recordFundedPledge(session: Stripe.Checkout.Session) {
  if (session.mode !== "payment" || session.payment_status !== "paid") return;

  const candidateId = metadataValue(session.metadata, "candidateId");
  const electionId = metadataValue(session.metadata, "electionId");
  const donorId = metadataValue(session.metadata, "userId");
  if (!candidateId && !electionId && !donorId) return;
  if (!isUuid(candidateId) || !isUuid(electionId) || !isUuid(donorId)) {
    console.error("checkout.session.completed is missing pledge metadata.", session.id);
    return;
  }
  if (donorId === candidateId) return;

  const amountCents = session.amount_total;
  if (amountCents == null || amountCents <= 0 || session.currency !== "usd") {
    throw new Error(`Checkout session ${session.id} has no USD amount.`);
  }

  const admin = createAdminClient();
  const sessionId = session.id;
  const dollars = amountCents / 100;

  const existing = await admin
    .from("campaign_pledges")
    .select("id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (existing.error && !isMissingRelation(existing.error)) {
    throw new Error(existing.error.message);
  }

  let pledgeId = existing.data?.id ?? null;
  if (!pledgeId) {
    const customerId = customerIdOf(session.customer);
    const { data, error } = await admin
      .from("campaign_pledges")
      .insert({
        donor_id: donorId,
        candidate_id: candidateId,
        election_id: electionId,
        amount: dollars,
        unlock_condition: ALIGNMENT_STREAK_UNLOCK_CONDITION,
        stripe_customer_id: customerId,
        stripe_session_id: sessionId,
        status: "pending",
      })
      .select("id")
      .single();

    if (error?.code === "23505") {
      const raced = await admin
        .from("campaign_pledges")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();
      if (raced.error) throw new Error(raced.error.message);
      pledgeId = raced.data?.id ?? null;
      if (!pledgeId) {
        throw new Error(error.message);
      }
    } else if (error?.code === "23503") {
      console.error("Funded pledge references a missing donor, candidate, or race.", error);
      return;
    } else if (error || !data) {
      throw new Error(error?.message ?? "Pledge insert returned no row.");
    } else {
      pledgeId = data.id;
    }
  }

  if (!pledgeId) return;

  const alert = await admin
    .from("user_notifications")
    .select("id")
    .eq("user_id", candidateId)
    .eq("type", "pledge_received")
    .eq("reference_id", pledgeId)
    .limit(1)
    .maybeSingle();
  if (alert.error && !isMissingRelation(alert.error)) {
    throw new Error(alert.error.message);
  }
  if (!alert.data) {
    await notifyPledgeFunded(admin, {
      candidateId,
      electionId,
      amount: dollars,
      pledgeId,
    });
  }

  try {
    revalidatePath(`/candidate/${candidateId}`);
    revalidatePath("/profile");
  } catch {
    // The pledge and alert are already saved. A cache refresh failure must
    // not make Stripe retry the webhook.
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
    } else if (event.type === "checkout.session.completed") {
      await recordFundedPledge(event.data.object as Stripe.Checkout.Session);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook handler failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
