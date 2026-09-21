"use server";

import Stripe from "stripe";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";
import { dollarsToCents, getStripe, paymentMethodIdOf } from "@/lib/stripe";
import type { CampaignPledge } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

const MIN_STRIPE_CENTS = 50;

export type CreatePledgeInput = {
  candidateId: string;
  amount: number;
  electionId?: string | null;
  accessToken?: string | null;
};

export type CreatePledgeResult = {
  ok: true;
  pledgeId: string;
  checkoutUrl: string;
  clientSecret: string;
};

function missingTableMessage() {
  return "campaign_pledges is not in the database yet. Apply the conditional escrow migration.";
}

function stripeMessage(error: unknown, fallback: string) {
  if (error instanceof Stripe.errors.StripeError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

async function requestOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (!host) return "http://localhost:3000";
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

async function resolveElectionId(
  admin: AdminClient,
  candidateId: string,
  electionId?: string | null,
) {
  const trimmed = electionId?.trim() ?? "";
  if (trimmed) {
    if (!isUuid(trimmed)) throw new Error("A valid election is required.");
    const { data, error } = await admin
      .from("districts")
      .select("id")
      .eq("id", trimmed)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("That seat is not on the map.");
    return trimmed;
  }

  const { data: candidate, error: candidateError } = await admin
    .from("users")
    .select("target_district_id")
    .eq("id", candidateId)
    .maybeSingle();
  if (candidateError) throw new Error(candidateError.message);

  const filed = (candidate as { target_district_id: string | null } | null)
    ?.target_district_id;
  if (filed) return filed;

  const { data: scores, error: scoreError } = await admin
    .from("electability_scores")
    .select("district_id")
    .eq("user_id", candidateId)
    .order("electability_multiplier", { ascending: false })
    .limit(1);
  if (scoreError && !isMissingRelation(scoreError)) throw new Error(scoreError.message);

  const matched = ((scores ?? []) as { district_id: string }[])[0]?.district_id;
  if (matched) return matched;

  throw new Error(
    "This campaign is not matched to a seat yet, so escrow cannot be opened.",
  );
}

async function reuseOrCreateCustomer(
  admin: AdminClient,
  stripe: Stripe,
  donorId: string,
) {
  const { data: existing, error } = await admin
    .from("campaign_pledges")
    .select("stripe_customer_id")
    .eq("donor_id", donorId)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) throw new Error(missingTableMessage());
    throw new Error(error.message);
  }

  const reused = (existing as { stripe_customer_id: string } | null)
    ?.stripe_customer_id;
  if (reused) return reused;

  const customer = await stripe.customers.create({
    metadata: { donor_id: donorId },
  });
  return customer.id;
}

export async function createPledge(
  input: CreatePledgeInput,
): Promise<CreatePledgeResult> {
  const candidateId = input.candidateId?.trim() ?? "";
  const amount = Number(input.amount);

  if (!isUuid(candidateId)) {
    throw new Error("A valid candidate is required.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }
  if (amount > MAX_PLEDGE_AMOUNT) {
    throw new Error(`Pledges are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)}.`);
  }

  const amountCents = dollarsToCents(amount);
  if (amountCents < MIN_STRIPE_CENTS) {
    throw new Error("Stripe requires a minimum authorization of $0.50.");
  }

  const donorId = await requireActionUserId(input.accessToken);
  if (!donorId) throw new Error("Sign in to vault a pledge.");
  if (donorId === candidateId) {
    throw new Error("You cannot escrow a pledge to your own campaign.");
  }

  const admin = createAdminClient();
  const { data: candidate, error: candidateError } = await admin
    .from("users")
    .select("id")
    .eq("id", candidateId)
    .maybeSingle();
  if (candidateError) throw new Error(candidateError.message);
  if (!candidate) throw new Error("Candidate not found.");

  const electionId = await resolveElectionId(admin, candidateId, input.electionId);

  try {
    const stripe = getStripe();
    const origin = await requestOrigin();
    const customerId = await reuseOrCreateCustomer(admin, stripe, donorId);
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: {
        donor_id: donorId,
        candidate_id: candidateId,
        election_id: electionId,
        amount: amount.toFixed(2),
      },
    });

    if (!setupIntent.client_secret) {
      throw new Error("Stripe did not return a SetupIntent client secret.");
    }

    const { data: pledge, error: insertError } = await admin
      .from("campaign_pledges")
      .insert({
        donor_id: donorId,
        candidate_id: candidateId,
        election_id: electionId,
        amount,
        stripe_customer_id: customerId,
        stripe_payment_method_id: paymentMethodIdOf(setupIntent.payment_method),
        stripe_setup_intent_id: setupIntent.id,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !pledge) {
      if (insertError && isMissingRelation(insertError)) {
        throw new Error(missingTableMessage());
      }
      throw new Error(insertError?.message ?? "Could not record the escrow pledge.");
    }

    await stripe.setupIntents.update(setupIntent.id, {
      metadata: {
        donor_id: donorId,
        candidate_id: candidateId,
        election_id: electionId,
        amount: amount.toFixed(2),
        pledge_id: pledge.id,
      },
    });

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      setup_intent_data: {
        metadata: {
          pledge_id: pledge.id,
          donor_id: donorId,
          candidate_id: candidateId,
          election_id: electionId,
          amount: amount.toFixed(2),
        },
      },
      metadata: {
        pledge_id: pledge.id,
        donor_id: donorId,
        candidate_id: candidateId,
        election_id: electionId,
        amount: amount.toFixed(2),
      },
      success_url: `${origin}/pledge/complete?pledge_id=${encodeURIComponent(pledge.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/profile/${candidateId}`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    revalidatePath(`/profile/${candidateId}`);
    revalidatePath(`/candidate/${candidateId}`);
    revalidatePath("/spectator");

    return {
      ok: true,
      pledgeId: pledge.id,
      checkoutUrl: session.url,
      clientSecret: setupIntent.client_secret,
    };
  } catch (error) {
    throw new Error(stripeMessage(error, "Could not vault this pledge."));
  }
}

function customerIdOf(value: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function completePledge(
  pledgeId: string,
  accessToken?: string | null,
  checkoutSessionId?: string | null,
) {
  const trimmed = pledgeId.trim();
  if (!isUuid(trimmed)) throw new Error("A valid pledge is required.");

  const donorId = await requireActionUserId(accessToken);
  if (!donorId) throw new Error("Sign in to finish vaulting this pledge.");

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("campaign_pledges")
    .select("*")
    .eq("id", trimmed)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) throw new Error(missingTableMessage());
    throw new Error(error.message);
  }

  const pledge = row as CampaignPledge | null;
  if (!pledge) throw new Error("Pledge not found.");
  if (pledge.donor_id !== donorId) {
    throw new Error("This escrow pledge belongs to another donor.");
  }
  if (pledge.status !== "pending") {
    return { ok: true as const, pledgeId: pledge.id, status: pledge.status };
  }

  try {
    const stripe = getStripe();
    let paymentMethodId = pledge.stripe_payment_method_id;
    let customerId = pledge.stripe_customer_id;
    let setupIntentId = pledge.stripe_setup_intent_id;

    const sessionId = checkoutSessionId?.trim();
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["setup_intent"],
      });
      if (session.metadata?.pledge_id && session.metadata.pledge_id !== pledge.id) {
        throw new Error("This Stripe session does not match the escrow pledge.");
      }
      const checkoutIntent =
        session.setup_intent && typeof session.setup_intent !== "string"
          ? session.setup_intent
          : null;
      paymentMethodId =
        paymentMethodIdOf(checkoutIntent?.payment_method) ?? paymentMethodId;
      customerId = customerIdOf(session.customer) ?? customerId;
      if (checkoutIntent?.id) setupIntentId = checkoutIntent.id;
    }

    if (!paymentMethodId && setupIntentId) {
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      if (setupIntent.status !== "succeeded") {
        throw new Error(
          "Confirm the card details with Stripe before this pledge is vaulted.",
        );
      }
      paymentMethodId = paymentMethodIdOf(setupIntent.payment_method);
      customerId = customerIdOf(setupIntent.customer) ?? customerId;
    }

    if (!paymentMethodId) {
      throw new Error("Stripe did not return a vaulted payment method.");
    }

    const { error: updateError } = await admin
      .from("campaign_pledges")
      .update({
        stripe_payment_method_id: paymentMethodId,
        stripe_customer_id: customerId,
        stripe_setup_intent_id: setupIntentId,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pledge.id)
      .eq("donor_id", donorId);

    if (updateError) throw new Error(updateError.message);

    revalidatePath(`/profile/${pledge.candidate_id}`);
    revalidatePath(`/candidate/${pledge.candidate_id}`);
    revalidatePath("/spectator");
    return { ok: true as const, pledgeId: pledge.id, status: "pending" as const };
  } catch (caught) {
    throw new Error(stripeMessage(caught, "Could not finish vaulting this pledge."));
  }
}
