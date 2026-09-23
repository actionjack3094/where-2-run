"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { customerIdOf, getStripe, paymentMethodIdOf } from "@/lib/stripe";
import {
  parsePledgeAmount,
  requireElection,
  stripeMessage,
} from "@/app/actions/escrow/shared";

export type RecordEscrowVaultPledgeInput = {
  setupIntentId: string;
  electionId: string;
  pledgedAmount: number;
  mandateAccepted: boolean;
  accessToken?: string | null;
};

export type RecordEscrowVaultPledgeResult = {
  ok: true;
  pledgeId: string;
};

function missingEscrowTableMessage() {
  return "escrow_pledges is not in the database yet. Apply the escrow pledges migration.";
}

export async function recordEscrowVaultPledge(
  input: RecordEscrowVaultPledgeInput,
): Promise<RecordEscrowVaultPledgeResult> {
  const setupIntentId = input.setupIntentId?.trim() ?? "";
  const { amount } = parsePledgeAmount(Number(input.pledgedAmount));

  if (!setupIntentId) {
    throw new Error("A SetupIntent is required to record this bounty.");
  }
  if (input.mandateAccepted !== true) {
    throw new Error("Accept the off-session charge agreement before this card is vaulted.");
  }

  const voterId = await requireActionUserId(input.accessToken);
  if (!voterId) throw new Error("Sign in to vault a conditional bounty.");

  const admin = createAdminClient();
  const election = await requireElection(admin, input.electionId ?? "");

  try {
    const stripe = getStripe();
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    if (setupIntent.status !== "succeeded") {
      throw new Error(
        "Confirm the card details with Stripe before this bounty is vaulted.",
      );
    }
    if (setupIntent.usage !== "off_session") {
      throw new Error("This card was not saved for a future off-session charge.");
    }

    const metadata = setupIntent.metadata ?? {};
    if (metadata.voter_id && metadata.voter_id !== voterId) {
      throw new Error("This SetupIntent belongs to another voter.");
    }
    if (metadata.election_id && metadata.election_id !== election.id) {
      throw new Error("This SetupIntent is not attached to that election.");
    }
    if (metadata.pledged_amount && metadata.pledged_amount !== amount.toFixed(2)) {
      throw new Error("The vaulted amount does not match this SetupIntent.");
    }

    const customerId = customerIdOf(setupIntent.customer);
    if (!customerId) {
      throw new Error("Stripe did not attach a customer to this SetupIntent.");
    }

    const paymentMethodId = paymentMethodIdOf(setupIntent.payment_method);
    if (!paymentMethodId) {
      throw new Error("Stripe did not return a vaulted payment method.");
    }

    const { data: existing, error: existingError } = await admin
      .from("escrow_pledges")
      .select("id")
      .eq("stripe_setup_intent_id", setupIntent.id)
      .maybeSingle();

    if (existingError) {
      if (isMissingRelation(existingError)) throw new Error(missingEscrowTableMessage());
      throw new Error(existingError.message);
    }
    if (existing?.id) return { ok: true, pledgeId: existing.id };

    const { data: pledge, error: insertError } = await admin
      .from("escrow_pledges")
      .insert({
        voter_id: voterId,
        election_id: election.id,
        pledged_amount: amount,
        stripe_setup_intent_id: setupIntent.id,
        stripe_customer_id: customerId,
        stripe_payment_method_id: paymentMethodId,
        status: "vaulted",
        mandate_accepted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !pledge) {
      if (insertError?.code === "23505") {
        const { data: raced } = await admin
          .from("escrow_pledges")
          .select("id")
          .eq("stripe_setup_intent_id", setupIntent.id)
          .maybeSingle();
        if (raced?.id) return { ok: true, pledgeId: raced.id };
      }
      if (insertError && isMissingRelation(insertError)) {
        throw new Error(missingEscrowTableMessage());
      }
      throw new Error(insertError?.message ?? "Could not record the escrow pledge.");
    }

    revalidatePath("/profile");
    revalidatePath(`/elections/${election.slug}`);

    return { ok: true, pledgeId: pledge.id };
  } catch (error) {
    throw new Error(stripeMessage(error, "Could not record this escrow bounty."));
  }
}
