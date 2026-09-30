"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { ALIGNMENT_STREAK_UNLOCK_CONDITION } from "@/lib/escrow";
import { formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";

export type SubmitPledgeResult =
  | { ok: true; pledgeId: string; amount: number; alreadyPledged: boolean }
  | { ok: false; error: string };

const GENERIC_ERROR = "We couldn't lock in that pledge. Please try again.";

/**
 * Lock in a conditional pledge for a candidate in a race. Writes a `pending`
 * row to `campaign_pledges` (donor, candidate, election, amount) that releases
 * once the candidate reaches a 10-debate alignment streak in the district.
 * No card is charged here.
 *
 * `electionId` may be an election id or a district id; both resolve to the
 * election. Pledging twice to the same candidate and race is a no-op that
 * returns the existing pledge. Failures come back as a clean `error` string,
 * never a raw database message.
 */
export async function submitPledge(
  candidateId: string,
  electionId: string,
  amount: number,
  accessToken?: string | null,
): Promise<SubmitPledgeResult> {
  try {
    const candidate = candidateId?.trim() ?? "";
    if (!isUuid(candidate)) return { ok: false, error: "Choose a valid candidate to back." };
    if (!isUuid(electionId?.trim() ?? "")) {
      return { ok: false, error: "This debate is not tied to a race yet." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: "Enter an amount greater than zero." };
    }
    if (amount > MAX_PLEDGE_AMOUNT) {
      return { ok: false, error: `Pledges are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)}.` };
    }

    const donorId = await requireActionUserId(accessToken);
    if (!donorId) return { ok: false, error: "Sign in to pledge." };
    if (donorId === candidate) {
      return { ok: false, error: "You can't pledge to your own campaign." };
    }

    const admin = createAdminClient();

    const { data: candidateRow, error: candidateError } = await admin
      .from("users")
      .select("id")
      .eq("id", candidate)
      .maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidateRow) return { ok: false, error: "That candidate could not be found." };

    // Accept an election id or a district id (debates can carry either).
    const { data: election, error: electionError } = await admin
      .from("elections")
      .select("id")
      .or(`id.eq.${electionId.trim()},district_id.eq.${electionId.trim()}`)
      .limit(1)
      .maybeSingle();
    if (electionError) throw electionError;
    if (!election) return { ok: false, error: "That race is no longer on the ballot." };

    const findOpen = () =>
      admin
        .from("campaign_pledges")
        .select("id, amount")
        .eq("donor_id", donorId)
        .eq("candidate_id", candidate)
        .eq("election_id", election.id)
        .eq("status", "pending")
        .is("stripe_setup_intent_id", null)
        .limit(1)
        .maybeSingle();

    const existing = await findOpen();
    if (existing.error) throw existing.error;
    if (existing.data) {
      return {
        ok: true,
        pledgeId: existing.data.id,
        amount: Number(existing.data.amount),
        alreadyPledged: true,
      };
    }

    const { data: pledge, error: insertError } = await admin
      .from("campaign_pledges")
      .insert({
        donor_id: donorId,
        candidate_id: candidate,
        election_id: election.id,
        amount,
        unlock_condition: ALIGNMENT_STREAK_UNLOCK_CONDITION,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !pledge) {
      // 23505: a parallel click inserted the same open pledge first.
      if (insertError?.code === "23505") {
        const raced = await findOpen();
        if (raced.data) {
          return {
            ok: true,
            pledgeId: raced.data.id,
            amount: Number(raced.data.amount),
            alreadyPledged: true,
          };
        }
      }
      throw insertError ?? new Error("Pledge insert returned no row.");
    }

    revalidatePath(`/candidate/${candidate}`);
    revalidatePath(`/profile/${candidate}`);
    revalidatePath("/elections/[slug]/profile", "page");
    revalidatePath("/spectator");
    revalidatePath("/my-campaign");

    return { ok: true, pledgeId: pledge.id, amount, alreadyPledged: false };
  } catch (caught) {
    // Log the real error server-side; the client only sees a clean message.
    console.error("submitPledge failed.", caught);
    return { ok: false, error: GENERIC_ERROR };
  }
}
