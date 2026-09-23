"use server";

import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getStripe } from "@/lib/stripe";
import {
  parsePledgeAmount,
  parseUnlockCondition,
  requireCandidate,
  requireElection,
  resolveElectionId,
  reuseOrCreateCustomer,
  stripeMessage,
} from "@/app/actions/escrow/shared";

export type CreateSetupIntentInput = {
  candidateId: string;
  amount: number;
  unlockCondition: string;
  electionId?: string | null;
  debateId?: string | null;
  accessToken?: string | null;
};

export type CreateSetupIntentResult = {
  ok: true;
  clientSecret: string;
  setupIntentId: string;
  customerId: string;
};

export async function createSetupIntent(
  input: CreateSetupIntentInput,
): Promise<CreateSetupIntentResult> {
  const candidateId = input.candidateId?.trim() ?? "";
  const { amount } = parsePledgeAmount(Number(input.amount));
  const unlockCondition = parseUnlockCondition(input.unlockCondition);

  const donorId = await requireActionUserId(input.accessToken);
  if (!donorId) throw new Error("Sign in to vault a bounty.");
  if (donorId === candidateId) {
    throw new Error("You cannot escrow a bounty on your own campaign.");
  }

  const admin = createAdminClient();
  await requireCandidate(admin, candidateId);

  try {
    const stripe = getStripe();
    const electionId = await resolveElectionId(admin, candidateId, input.electionId);
    const customerId = await reuseOrCreateCustomer(admin, stripe, donorId);
    const debateId = isUuid(input.debateId?.trim() ?? "")
      ? input.debateId!.trim()
      : "";
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: {
        donor_id: donorId,
        candidate_id: candidateId,
        election_id: electionId,
        amount: amount.toFixed(2),
        unlock_condition: unlockCondition,
        ...(debateId ? { debate_id: debateId } : {}),
      },
    });

    if (!setupIntent.client_secret) {
      throw new Error("Stripe did not return a SetupIntent client secret.");
    }

    return {
      ok: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      customerId,
    };
  } catch (error) {
    throw new Error(stripeMessage(error, "Could not open this escrow SetupIntent."));
  }
}

export type CreateEscrowVaultSetupIntentInput = {
  electionId: string;
  pledgedAmount: number;
  accessToken?: string | null;
};

export async function createEscrowVaultSetupIntent(
  input: CreateEscrowVaultSetupIntentInput,
): Promise<CreateSetupIntentResult> {
  const electionId = input.electionId?.trim() ?? "";
  const { amount } = parsePledgeAmount(Number(input.pledgedAmount));

  const voterId = await requireActionUserId(input.accessToken);
  if (!voterId) throw new Error("Sign in to vault a conditional bounty.");

  const admin = createAdminClient();
  const election = await requireElection(admin, electionId);

  try {
    const stripe = getStripe();
    const customerId = await reuseOrCreateCustomer(admin, stripe, voterId);
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: {
        voter_id: voterId,
        election_id: election.id,
        pledged_amount: amount.toFixed(2),
        purpose: "conditional_bounty",
      },
    });

    if (!setupIntent.client_secret) {
      throw new Error("Stripe did not return a SetupIntent client secret.");
    }

    return {
      ok: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      customerId,
    };
  } catch (error) {
    throw new Error(stripeMessage(error, "Could not open this escrow SetupIntent."));
  }
}
