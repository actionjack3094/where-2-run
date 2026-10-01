/**
 * World Football Elo ratings for debate tournaments.
 *
 * R_new = R_old + K * G * (W - W_e)
 *
 * W_e = 1 / (10^(-dr/400) + 1)  where dr is the rating difference (own − opponent)
 * G   is the goal-difference / margin factor from the spectator vote split
 * K   is tournament weight (20 for early stages, 60 for finals)
 */

export const DEFAULT_ELO = 1200;
export const ELO_SCALE = 400;
export const MIN_ELO = 100;

/** Early-round / group-stage weight. */
export const K_EARLY = 20;
/** Finals / championship-match weight. */
export const K_FINALS = 60;

export type TournamentStage = "early" | "finals";

export type EloResult = {
  rating: number;
  opponentRating: number;
  expected: number;
  actual: number;
  margin: number;
  k: number;
  nextRating: number;
  delta: number;
};

export type PairEloUpdate = {
  winnerId: string;
  loserId: string;
  winnerVotes: number;
  loserVotes: number;
  winner: EloResult;
  loser: EloResult;
};

export function parseElo(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_ELO;
}

export function kForStage(stage: TournamentStage | number = "early") {
  if (typeof stage === "number") {
    return Number.isFinite(stage) && stage > 0 ? stage : K_EARLY;
  }
  return stage === "finals" ? K_FINALS : K_EARLY;
}

/**
 * Expected result W_e for `rating` against `opponentRating`.
 * W_e = 1 / (10^(-dr/400) + 1) where dr = rating − opponentRating.
 */
export function expectedResult(rating: number, opponentRating: number, scale = ELO_SCALE) {
  const dr = rating - opponentRating;
  return 1 / (10 ** (-dr / scale) + 1);
}

/**
 * Spectator vote margin as the World Football G-factor.
 *
 * Vote share difference is scaled so that:
 * - 51/49 (N ≤ 1) → G = 1.0  (one-goal game)
 * - two-goal equivalent → G = 1.5
 * - 80/20 (N = 9) → G = 2.5  via (11 + N) / 8
 */
export function marginFactor(winnerVotes: number, loserVotes: number): number {
  const win = Math.max(0, winnerVotes);
  const lose = Math.max(0, loserVotes);
  const total = win + lose;
  if (total <= 0) return 1;

  const n = Math.round((Math.abs(win - lose) / total) * 15);
  if (n <= 1) return 1;
  if (n === 2) return 1.5;
  return (11 + n) / 8;
}

export function clampElo(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_ELO;
  return Math.max(MIN_ELO, Math.round(value));
}

/**
 * Apply one World Football Elo step.
 * `won` is 1 for a win, 0.5 for a draw, 0 for a loss.
 */
export function nextElo(input: {
  rating: number;
  opponentRating: number;
  won: number;
  k?: number;
  winnerVotes: number;
  loserVotes: number;
}): EloResult {
  const rating = parseElo(input.rating);
  const opponentRating = parseElo(input.opponentRating);
  const k = kForStage(input.k ?? K_EARLY);
  const actual = Math.min(1, Math.max(0, input.won));
  const expected = expectedResult(rating, opponentRating);
  const margin = marginFactor(input.winnerVotes, input.loserVotes);
  const nextRating = clampElo(rating + k * margin * (actual - expected));

  return {
    rating,
    opponentRating,
    expected,
    actual,
    margin,
    k,
    nextRating,
    delta: nextRating - rating,
  };
}

export function ratingsAfterVoteMargin(input: {
  winnerId: string;
  loserId: string;
  winnerRating: number;
  loserRating: number;
  winnerVotes: number;
  loserVotes: number;
  k?: number;
}): PairEloUpdate {
  const k = kForStage(input.k ?? K_EARLY);
  const winner = nextElo({
    rating: input.winnerRating,
    opponentRating: input.loserRating,
    won: 1,
    k,
    winnerVotes: input.winnerVotes,
    loserVotes: input.loserVotes,
  });
  const loser = nextElo({
    rating: input.loserRating,
    opponentRating: input.winnerRating,
    won: 0,
    k,
    winnerVotes: input.winnerVotes,
    loserVotes: input.loserVotes,
  });

  return {
    winnerId: input.winnerId,
    loserId: input.loserId,
    winnerVotes: input.winnerVotes,
    loserVotes: input.loserVotes,
    winner,
    loser,
  };
}

export function countBallotsFor(
  votes: Array<{ voteForUserId: string }>,
  candidateId: string,
) {
  return votes.filter((vote) => vote.voteForUserId === candidateId).length;
}
