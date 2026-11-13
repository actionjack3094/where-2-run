export const PROSPECT_MIN = 1000;
export const CHALLENGER_MIN = 1150;
export const CONTENDER_MIN = 1300;

const K = 50;

export type PrimaryTier = "Prospect" | "Challenger" | "Contender";

/** Floor is Prospect. Challenger and Contender start at their minimum AR. */
export function getPrimaryTier(ar: number): PrimaryTier {
  if (ar >= CONTENDER_MIN) return "Contender";
  if (ar >= CHALLENGER_MIN) return "Challenger";
  return "Prospect";
}

/**
 * FIFA/Elo delta. Expected score uses a 400-point scale. K is 50.
 * Ideology multiplier weights substance and ideology grading.
 */
export function calculateArenaRatingChange(
  playerAR: number,
  opponentAR: number,
  score: number,
  ideologyMultiplier: number,
): number {
  const E = 1 / (1 + Math.pow(10, (opponentAR - playerAR) / 400));
  return Math.round(K * ideologyMultiplier * (score - E));
}
