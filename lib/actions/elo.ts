export interface EloParticipant {
  userId: string;
  rating: number;
}

export interface MatchResult {
  votesA: number;
  votesB: number;
  kFactor?: number; // Defaults to 32 (tournament standard)
}

export interface UpdatedRatings {
  newRatingA: number;
  newRatingB: number;
  deltaA: number;
  deltaB: number;
}

/**
 * Calculates updated ratings using the FIFA-adapted Elo formula:
 * R_new = R_old + K * G * (W - W_e)
 */
export function calculateDebateElo(
  debaterA: EloParticipant,
  debaterB: EloParticipant,
  result: MatchResult
): UpdatedRatings {
  const K = result.kFactor ?? 32;
  const totalVotes = result.votesA + result.votesB;

  // Actual match outcome W (1 = Win, 0.5 = Draw, 0 = Loss)
  let outcomeA = 0.5;
  if (result.votesA > result.votesB) outcomeA = 1.0;
  else if (result.votesB > result.votesA) outcomeA = 0.0;
  const outcomeB = 1.0 - outcomeA;

  // Expected outcome W_e
  const ratingDiff = debaterB.rating - debaterA.rating;
  const expectedA = 1 / (1 + Math.pow(10, ratingDiff / 400));
  const expectedB = 1 - expectedA;

  // Margin of victory G-factor (scaled from 1.0 for draws up to 2.5 for blowouts)
  let gFactor = 1.0;
  if (totalVotes > 0) {
    const voteMarginRatio = Math.abs(result.votesA - result.votesB) / totalVotes;
    gFactor = 1.0 + 1.5 * voteMarginRatio;
  }

  // Calculate rating shifts
  const deltaA = Math.round(K * gFactor * (outcomeA - expectedA));
  const deltaB = Math.round(K * gFactor * (outcomeB - expectedB));

  return {
    newRatingA: debaterA.rating + deltaA,
    newRatingB: debaterB.rating + deltaB,
    deltaA,
    deltaB,
  };
}
