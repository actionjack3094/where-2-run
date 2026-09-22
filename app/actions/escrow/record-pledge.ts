"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  customerIdOf,
  getStripe,
  paymentMethodIdOf,
} from "@/lib/stripe";
import {
  missingPledgeTableMessage,
  parsePledgeAmount,
  parseUnlockCondition,
  requireCandidate,
  resolveElectionId,
  stripeMessage,
} from "@/app/actions/escrow/shared";

export type RecordEscrowPledgeInput = {
  setupIntentId: string;
  candidateId: string;
  amount: number;
  unlockCondition: string;
  electionId?: string | null;
  debateId?: string | null;
  accessToken?: string | null;
};

export type RecordEscrowPledgeResult = {
  ok: true;
  pledgeId: string;
};

export async function recordEscrowPledge(
  input: RecordEscrowPledgeInput,
): Promise<RecordEscrowPledgeResult> {
  const setupIntentId = input.setupIntentId?.trim() ?? "";
  const candidateId = input.candidateId?.trim() ?? "";
  const { amount } = parsePledgeAmount(Number(input.amount));
  const unlockCondition = parseUnlockCondition(input.unlockCondition);

  if (!setupIntentId) {
    throw new Error("A SetupIntent is required to record this bounty.");
  }

  const donorId = await requireActionUserId(input.accessToken);
  if (!donorId) throw new Error("Sign in to vault a bounty.");
  if (donorId === candidateId) {
    throw new Error("You cannot escrow a bounty on your own campaign.");
  }

  const admin = createAdminClient();
  await requireCandidate(admin, candidateId);

  try {
    const stripe = getStripe();
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    if (setupIntent.status !== "succeeded") {
      throw new Error(
        "Confirm the card details with Stripe before this bounty is vaulted.",
      );
    }

    const metadata = setupIntent.metadata ?? {};
    if (metadata.donor_id && metadata.donor_id !== donorId) {
      throw new Error("This SetupIntent belongs to another donor.");
    }
    if (metadata.candidate_id && metadata.candidate_id !== candidateId) {
      throw new Error("This SetupIntent is not attached to that candidate.");
    }
    if (metadata.amount && metadata.amount !== amount.toFixed(2)) {
      throw new Error("The vaulted amount does not match this SetupIntent.");
    }
    if (metadata.unlock_condition && metadata.unlock_condition !== unlockCondition) {
      throw new Error("The unlock condition does not match this SetupIntent.");
    }

    const customerId = customerIdOf(setupIntent.customer);
    if (!customerId) {
      throw new Error("Stripe did not attach a customer to this SetupIntent.");
    }

    const electionId =
      metadata.election_id ||
      (await resolveElectionId(admin, candidateId, input.electionId));
    const debateIdRaw =
      input.debateId?.trim() || metadata.debate_id || "";
    const debateId = isUuid(debateIdRaw) ? debateIdRaw : null;

    const { data: existing, error: existingError } = await admin
      .from("campaign_pledges")
      .select("id")
      .eq("stripe_setup_intent_id", setupIntent.id)
      .maybeSingle();

    if (existingError) {
      if (isMissingRelation(existingError)) {
        throw new Error(missingPledgeTableMessage());
      }
      throw new Error(existingError.message);
    }

    if (existing?.id) {
      return { ok: true, pledgeId: existing.id };
    }

    const insertPayload = {
      donor_id: donorId,
      candidate_id: candidateId,
      election_id: electionId,
      amount,
      unlock_condition: unlockCondition,
      ...(debateId ? { debate_id: debateId } : {}),
      stripe_customer_id: customerId,
      stripe_payment_method_id: paymentMethodIdOf(setupIntent.payment_method),
      stripe_setup_intent_id: setupIntent.id,
      status: "pending" as const,
    };

    let { data: pledge, error: insertError } = await admin
      .from("campaign_pledges")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError && /unlock_condition|debate_id/i.test(insertError.message ?? "")) {
      const { unlock_condition: _unlock, debate_id: _debate, ...withoutExtras } =
        insertPayload;
      const retry = await admin
        .from("campaign_pledges")
        .insert(withoutExtras)
        .select("id")
        .single();
      pledge = retry.data;
      insertError = retry.error;
    }

    if (insertError || !pledge) {
      if (insertError?.code === "23505") {
        const { data: raced } = await admin
          .from("campaign_pledges")
          .select("id")
          .eq("stripe_setup_intent_id", setupIntent.id)
          .maybeSingle();
        if (raced?.id) return { ok: true, pledgeId: raced.id };
      }
      if (insertError && isMissingRelation(insertError)) {
        throw new Error(missingPledgeTableMessage());
      }
      throw new Error(insertError?.message ?? "Could not record the escrow pledge.");
    }

    revalidatePath(`/profile/${candidateId}`);
    revalidatePath(`/candidate/${candidateId}`);
    revalidatePath("/elections");
    revalidatePath("/spectator");
    revalidatePath("/my-campaign");

    return { ok: true, pledgeId: pledge.id };
  } catch (error) {
    throw new Error(stripeMessage(error, "Could not record this escrow bounty."));
  }
}
