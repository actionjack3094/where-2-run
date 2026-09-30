/**
 * Ballot weights for debate tallying.
 *
 * A voter is a verified constituent when the debate's district OCD-ID is in
 * their tier2_verifications.ocd_ids (written by the address lookup and by
 * manual approval). SQL mirrors this in calculate_debate_winner(); change both
 * together (supabase/migrations/20260930160000_weighted_debate_winner.sql).
 */
export const CONSTITUENT_VOTE_WEIGHT = 3;
export const SPECTATOR_VOTE_WEIGHT = 1;

export type Tally = { a: number; b: number };

export function voteWeight(verifiedConstituent: boolean) {
  return verifiedConstituent ? CONSTITUENT_VOTE_WEIGHT : SPECTATOR_VOTE_WEIGHT;
}

/** "Raw Votes: 4–3 | Weighted Votes: 4w–9w" */
export function formatTally(raw: Tally, weighted: Tally) {
  return `Raw Votes: ${raw.a}–${raw.b} | Weighted Votes: ${weighted.a}w–${weighted.b}w`;
}

export type DisplayTally = {
  /** What the UI leads with: weighted totals once tallied, else raw ballots. */
  primary: Tally;
  raw: Tally;
  /** True when `primary` is weighted. False means fall back to raw. */
  weighted: boolean;
};

/**
 * Weighted totals of 0–0 mean "not tallied" (voting still open, or a debate
 * completed before weights were stored), so show raw ballots instead.
 */
export function displayTally(raw: Tally, weighted: Tally | null | undefined): DisplayTally {
  const settled = Boolean(weighted && weighted.a + weighted.b > 0);
  return { primary: settled && weighted ? weighted : raw, raw, weighted: settled };
}

/** "3w – 6w (Raw: 3 – 2)" */
export function formatWeightedSubtitle(raw: Tally, weighted: Tally) {
  return `${weighted.a}w – ${weighted.b}w (Raw: ${raw.a} – ${raw.b})`;
}
