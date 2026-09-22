import {
  DEFAULT_ELO,
  expectedScore,
  nextRating,
} from "@/lib/arena/elo";

/** Default district strength: a typical unrated / baseline seat. */
export const DEFAULT_DISTRICT_BASELINE = DEFAULT_ELO;

/** Ensemble confidence (0–100) that locks a Pass. */
export const PASS_AI_SCORE_MIN = 90;

/**
 * Ensemble confidence (0–100) that triggers the 150-word Clarification
 * Addendum. ELO is frozen until the candidate files or the score leaves
 * this band.
 */
export const MARGINAL_AI_SCORE_MIN = 60;
export const MARGINAL_AI_SCORE_MAX = 89;

/** New / lower-tier candidates. Higher volatility while the rating is unproven. */
export const K_FACTOR_NEW = 40;
/** Mid-tier established candidates. */
export const K_FACTOR_ESTABLISHED = 24;
/** High-tier candidates. Smaller swings once the rating is proven. */
export const K_FACTOR_HIGH = 16;

export const HIGH_TIER_ELO = 2000;
export const ESTABLISHED_TIER_ELO = 1600;

export function isMarginalAiScore(aiScore: number) {
  return aiScore >= MARGINAL_AI_SCORE_MIN && aiScore <= MARGINAL_AI_SCORE_MAX;
}

/** K-factor shrinks as a candidate climbs the rating tiers. */
export function kFactor(candidateRating: number) {
  if (candidateRating >= HIGH_TIER_ELO) return K_FACTOR_HIGH;
  if (candidateRating >= ESTABLISHED_TIER_ELO) return K_FACTOR_ESTABLISHED;
  return K_FACTOR_NEW;
}

function actualScoreFromAi(aiScore: number) {
  if (aiScore >= PASS_AI_SCORE_MIN) return 1;
  return 0;
}

/**
 * Recalculate a candidate's ELO against a district baseline using the
 * ensemble AI score as the game result.
 *
 * - Pass (90+): treated as a win vs the district.
 * - Fail (below 60): treated as a loss vs the district.
 * - Marginal (60–89): returns the unmodified rating so the 150-word
 *   Clarification Addendum can be filed first.
 */
export function calculateNewElo(
  candidateRating: number,
  districtBaseline: number,
  aiScore: number,
) {
  const rating = Number.isFinite(candidateRating)
    ? candidateRating
    : DEFAULT_DISTRICT_BASELINE;
  const baseline = Number.isFinite(districtBaseline)
    ? districtBaseline
    : DEFAULT_DISTRICT_BASELINE;
  const score = Number.isFinite(aiScore) ? aiScore : 0;

  if (isMarginalAiScore(score)) return rating;

  return nextRating(
    rating,
    expectedScore(rating, baseline),
    actualScoreFromAi(score),
    kFactor(rating),
  );
}
