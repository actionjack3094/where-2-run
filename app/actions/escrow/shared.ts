import Stripe from "stripe";
import { isUuid } from "@/lib/arena/display";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isBountyUnlockConditionId } from "@/lib/escrow";
import { formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";
import { dollarsToCents } from "@/lib/stripe";

export type AdminClient = ReturnType<typeof createAdminClient>;

export const MIN_STRIPE_CENTS = 50;

export function missingPledgeTableMessage() {
  return "campaign_pledges is not in the database yet. Apply the conditional escrow migration.";
}

export function stripeMessage(error: unknown, fallback: string) {
  if (error instanceof Stripe.errors.StripeError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function parsePledgeAmount(amount: number) {
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
  return { amount, amountCents };
}

export function parseUnlockCondition(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!isBountyUnlockConditionId(trimmed)) {
    throw new Error("Choose a trigger condition for this bounty.");
  }
  return trimmed;
}

async function electionIdFromDistrict(admin: AdminClient, districtId: string) {
  const { data, error } = await admin
    .from("elections")
    .select("id")
    .or(`id.eq.${districtId},district_id.eq.${districtId}`)
    .maybeSingle();
  if (error && !isMissingRelation(error)) throw new Error(error.message);
  return (data as { id: string } | null)?.id ?? districtId;
}

export async function resolveElectionId(
  admin: AdminClient,
  candidateId: string,
  electionId?: string | null,
) {
  const trimmed = electionId?.trim() ?? "";
  if (trimmed) {
    if (!isUuid(trimmed)) throw new Error("A valid election is required.");
    const { data, error } = await admin
      .from("elections")
      .select("id")
      .eq("id", trimmed)
      .maybeSingle();
    if (error && !isMissingRelation(error)) throw new Error(error.message);
    if (data) return (data as { id: string }).id;

    const fromDistrict = await electionIdFromDistrict(admin, trimmed);
    if (fromDistrict) return fromDistrict;

    const { data: district, error: districtError } = await admin
      .from("districts")
      .select("id")
      .eq("id", trimmed)
      .maybeSingle();
    if (districtError) throw new Error(districtError.message);
    if (!district) throw new Error("That seat is not on the map.");
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
  if (filed) return electionIdFromDistrict(admin, filed);

  const { data: scores, error: scoreError } = await admin
    .from("electability_scores")
    .select("district_id")
    .eq("user_id", candidateId)
    .order("electability_multiplier", { ascending: false })
    .limit(1);
  if (scoreError && !isMissingRelation(scoreError)) throw new Error(scoreError.message);

  const matched = ((scores ?? []) as { district_id: string }[])[0]?.district_id;
  if (matched) return electionIdFromDistrict(admin, matched);

  throw new Error(
    "This campaign is not matched to a seat yet, so escrow cannot be opened.",
  );
}

export async function reuseOrCreateCustomer(
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
    if (isMissingRelation(error)) throw new Error(missingPledgeTableMessage());
    throw new Error(error.message);
  }

  const reused = (existing as { stripe_customer_id: string } | null)
    ?.stripe_customer_id;
  if (reused) return reused;

  const { data: vaulted, error: vaultError } = await admin
    .from("escrow_pledges")
    .select("stripe_customer_id")
    .eq("voter_id", donorId)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (vaultError) {
    if (!isMissingRelation(vaultError)) throw new Error(vaultError.message);
  } else {
    const vaultCustomer = (vaulted as { stripe_customer_id: string } | null)
      ?.stripe_customer_id;
    if (vaultCustomer) return vaultCustomer;
  }

  const customer = await stripe.customers.create({
    metadata: { donor_id: donorId },
  });
  return customer.id;
}

export async function requireElection(admin: AdminClient, electionId: string) {
  const trimmed = electionId.trim();
  if (!isUuid(trimmed)) throw new Error("A valid election is required.");

  const { data, error } = await admin
    .from("elections")
    .select("id, office_name, slug")
    .eq("id", trimmed)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That election is not on the ballot.");
  return data as { id: string; office_name: string; slug: string };
}

export async function requireCandidate(admin: AdminClient, candidateId: string) {
  if (!isUuid(candidateId)) {
    throw new Error("A valid candidate is required.");
  }
  const { data: candidate, error } = await admin
    .from("users")
    .select("id")
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!candidate) throw new Error("Candidate not found.");
  return candidateId;
}
