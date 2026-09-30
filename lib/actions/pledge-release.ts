import { createAdminClient } from "@/lib/db/supabase-admin";
import { ALIGNMENT_STREAK_UNLOCK_CONDITION } from "@/lib/escrow";

// Deliberately NOT a "use server" module. Server actions are public POST
// endpoints, and this writes with the service-role key and does no auth check.
// It must only be called from trusted server code (the calibration callers),
// never from the browser.

/** Streak length at which `alignment_streak_10` pledges release. */
export const ALIGNMENT_RELEASE_STREAK = 10;

export type ReleaseEscrowPledgesResult = {
  /** Pending pledges moved to `released` by this call. */
  released: number;
  /** Total dollars across those pledges. */
  releasedAmount: number;
  /** Released pledges with a vaulted card, i.e. ready for Stripe capture. */
  capturable: number;
};

export type CalibrationStreakRow = { target_election_id: string; new_streak: number };

/**
 * Feed this the rows returned by the `calibrate_district_alignment` RPC. For
 * every race where the candidate's `new_streak` reached 10, releases that
 * race's pledges. Rows below 10 (and an ejected district, which returns no
 * rows) are ignored.
 */
export async function releaseForReachedStreaks(
  candidateId: string,
  rows: CalibrationStreakRow[] | null | undefined,
) {
  const results: (ReleaseEscrowPledgesResult & { electionId: string; newStreak: number })[] = [];
  for (const row of rows ?? []) {
    const newStreak = Number(row.new_streak);
    if (!(newStreak >= ALIGNMENT_RELEASE_STREAK)) continue;
    const result = await releaseEscrowPledges(candidateId, row.target_election_id);
    results.push({ ...result, electionId: row.target_election_id, newStreak });
  }
  return results;
}

/**
 * Release every pending `alignment_streak_10` pledge on a candidate in a race.
 * Call this once the candidate's `alignment_streak` reaches 10.
 *
 * Idempotent: only `pending` rows are touched, so calling it again on streak 11,
 * 12, ... (or after a retry) releases nothing new and returns zeros. Pledges
 * made after the streak already hit 10 stay pending until the next calibration.
 *
 * Throws on a database error. Callers decide whether a failed release should
 * abort their own work; the update is safe to retry.
 */
export async function releaseEscrowPledges(
  candidateId: string,
  electionId: string,
): Promise<ReleaseEscrowPledgesResult> {
  const admin = createAdminClient();

  // The status filter makes this claim-once: two concurrent calls cannot both
  // release the same row, because the second one no longer matches `pending`.
  const { data, error } = await admin
    .from("campaign_pledges")
    .update({ status: "released", updated_at: new Date().toISOString() })
    .eq("candidate_id", candidateId)
    .eq("election_id", electionId)
    .eq("status", "pending")
    .eq("unlock_condition", ALIGNMENT_STREAK_UNLOCK_CONDITION)
    .select("id, amount, donor_id, stripe_customer_id, stripe_payment_method_id");

  if (error) throw new Error(`Could not release escrow pledges: ${error.message}`);

  const released = data ?? [];

  // ---------------------------------------------------------------------------
  // STRIPE CAPTURE GOES HERE.
  //
  // `released` is exactly the set of rows this call just moved pending ->
  // released, so it is safe to charge them without double-charging on retries.
  // When capture is built, iterate it like this:
  //
  //   for (const pledge of released) {
  //     // Cardless test pledges (one-click "Donate $50") have a null
  //     // stripe_customer_id / stripe_payment_method_id. Skip them: there is
  //     // nothing to charge until the donor vaults a card.
  //     const customerId = pledge.stripe_customer_id?.trim();
  //     const paymentMethodId = pledge.stripe_payment_method_id?.trim();
  //     if (!customerId || !paymentMethodId) continue;
  //
  //     try {
  //       await getStripe().paymentIntents.create(
  //         {
  //           amount: dollarsToCents(parseAmount(pledge.amount)),
  //           currency: "usd",
  //           customer: customerId,
  //           payment_method: paymentMethodId,
  //           off_session: true,
  //           confirm: true,
  //           metadata: { pledge_id: pledge.id, candidate_id: candidateId,
  //                       election_id: electionId, donor_id: pledge.donor_id },
  //         },
  //         // Idempotency key so a retried release never charges twice.
  //         { idempotencyKey: `pledge-release-${pledge.id}` },
  //       );
  //       // then: update campaign_pledges set status = 'captured' where id = pledge.id
  //     } catch {
  //       // on a declined card: set status = 'failed' for this pledge only,
  //       // and keep looping so one bad card does not block the rest.
  //     }
  //   }
  //
  // See app/actions/stripe/capture-escrow.ts for the existing off-session
  // charge loop this should share code with.
  // ---------------------------------------------------------------------------
  const capturable = released.filter(
    (pledge) => pledge.stripe_customer_id?.trim() && pledge.stripe_payment_method_id?.trim(),
  ).length;

  return {
    released: released.length,
    releasedAmount: released.reduce((sum, pledge) => sum + Number(pledge.amount), 0),
    capturable,
  };
}
