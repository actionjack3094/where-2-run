export const DEFAULT_ELO = 1200;
export const ELO_SCALE = 400;
export const ELO_K = 32;
export const ELO_BRACKET = 100;
export const MIN_ELO = 100;

export function parseElo(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_ELO;
}

/** Expected score for `rating` against `opponentRating`. Scale of 400. */
export function expectedScore(
  rating: number,
  opponentRating: number,
  scale = ELO_SCALE,
) {
  return 1 / (1 + 10 ** ((opponentRating - rating) / scale));
}

/** Expected scores for both candidates from their current ratings. */
export function expectedScores(
  ratingA: number,
  ratingB: number,
  scale = ELO_SCALE,
) {
  const expectedA = expectedScore(ratingA, ratingB, scale);
  const expectedB = expectedScore(ratingB, ratingA, scale);
  return { expectedA, expectedB };
}

export function nextRating(
  rating: number,
  expected: number,
  score: number,
  k = ELO_K,
) {
  return Math.max(MIN_ELO, Math.round(rating + k * (score - expected)));
}

export function ratingsAfterResult(winnerRating: number, loserRating: number) {
  const { expectedA: expectedWinner, expectedB: expectedLoser } = expectedScores(
    winnerRating,
    loserRating,
  );

  return {
    winnerElo: nextRating(winnerRating, expectedWinner, 1),
    loserElo: nextRating(loserRating, expectedLoser, 0),
    expectedWinner,
    expectedLoser,
  };
}

export function inEloBracket(
  left: number,
  right: number,
  bracket = ELO_BRACKET,
) {
  return Math.abs(left - right) <= bracket;
}
