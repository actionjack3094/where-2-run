import { describe, expect, it } from "vitest";
import { ADDENDUM_WORD_LIMIT } from "@/lib/arena/evaluations";
import {
  calculateNewElo,
  DEFAULT_DISTRICT_BASELINE,
  HIGH_TIER_ELO,
  kFactor,
  K_FACTOR_HIGH,
  K_FACTOR_NEW,
  MARGINAL_AI_SCORE_MAX,
  MARGINAL_AI_SCORE_MIN,
  PASS_AI_SCORE_MIN,
} from "@/lib/math/elo";

const HIGH_ELO_CANDIDATE = 1800;
const NEW_CANDIDATE = 1100;
const PASS_SCORE = 95;
const FAIL_SCORE = 42;
const MARGINAL_SCORE = 75;

describe("calculateNewElo", () => {
  it("awards a small gain when a high-ELO candidate passes a baseline district debate", () => {
    const nextElo = calculateNewElo(
      HIGH_ELO_CANDIDATE,
      DEFAULT_DISTRICT_BASELINE,
      PASS_SCORE,
    );

    expect(PASS_SCORE).toBeGreaterThanOrEqual(PASS_AI_SCORE_MIN);
    expect(nextElo).toBeGreaterThan(HIGH_ELO_CANDIDATE);
    expect(nextElo - HIGH_ELO_CANDIDATE).toBeLessThanOrEqual(4);
  });

  it("applies a large penalty when a high-ELO candidate fails a baseline district debate", () => {
    const expectedWin = calculateNewElo(
      HIGH_ELO_CANDIDATE,
      DEFAULT_DISTRICT_BASELINE,
      PASS_SCORE,
    );
    const upsetLoss = calculateNewElo(
      HIGH_ELO_CANDIDATE,
      DEFAULT_DISTRICT_BASELINE,
      FAIL_SCORE,
    );

    expect(FAIL_SCORE).toBeLessThan(MARGINAL_AI_SCORE_MIN);
    expect(upsetLoss).toBeLessThan(HIGH_ELO_CANDIDATE);
    expect(HIGH_ELO_CANDIDATE - upsetLoss).toBeGreaterThan(
      expectedWin - HIGH_ELO_CANDIDATE,
    );
  });

  it("returns the unmodified ELO when the AI score triggers the 150-word clarification addendum", () => {
    expect(ADDENDUM_WORD_LIMIT).toBe(150);

    const bandFloor = calculateNewElo(
      HIGH_ELO_CANDIDATE,
      DEFAULT_DISTRICT_BASELINE,
      MARGINAL_AI_SCORE_MIN,
    );
    const bandMid = calculateNewElo(
      HIGH_ELO_CANDIDATE,
      DEFAULT_DISTRICT_BASELINE,
      MARGINAL_SCORE,
    );
    const bandCeiling = calculateNewElo(
      HIGH_ELO_CANDIDATE,
      DEFAULT_DISTRICT_BASELINE,
      MARGINAL_AI_SCORE_MAX,
    );

    expect(bandFloor).toBe(HIGH_ELO_CANDIDATE);
    expect(bandMid).toBe(HIGH_ELO_CANDIDATE);
    expect(bandCeiling).toBe(HIGH_ELO_CANDIDATE);
  });

  it("gives new lower-tier candidates higher rating volatility than established high-tier candidates", () => {
    const highTier = HIGH_TIER_ELO + 100;

    const newDelta = Math.abs(
      calculateNewElo(NEW_CANDIDATE, NEW_CANDIDATE, PASS_SCORE) - NEW_CANDIDATE,
    );
    const highDelta = Math.abs(
      calculateNewElo(highTier, highTier, PASS_SCORE) - highTier,
    );

    expect(kFactor(NEW_CANDIDATE)).toBe(K_FACTOR_NEW);
    expect(kFactor(highTier)).toBe(K_FACTOR_HIGH);
    expect(kFactor(NEW_CANDIDATE)).toBeGreaterThan(kFactor(highTier));
    expect(newDelta).toBeGreaterThan(highDelta);
  });
});
