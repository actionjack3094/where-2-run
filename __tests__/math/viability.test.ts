import { describe, expect, it } from "vitest";
import { DEFAULT_ELO, expectedScore, nextRating } from "@/lib/arena/elo";
import {
  calculateNewElo,
  ESTABLISHED_TIER_ELO,
  HIGH_TIER_ELO,
  kFactor,
  K_FACTOR_ESTABLISHED,
  K_FACTOR_HIGH,
  K_FACTOR_NEW,
  PASS_AI_SCORE_MIN,
} from "@/lib/math/elo";
import {
  calculateDraftViabilityScore,
  ELO_NORMALIZE_CEILING,
  ELO_NORMALIZE_FLOOR,
  GENERAL_VIABILITY_WEIGHT,
  NORMALIZED_ELO_WEIGHT,
  normalizeElo,
  PRIMARY_MATCH_WEIGHT,
  type DraftViabilityInput,
} from "@/lib/math/viability";

function viability(input: DraftViabilityInput) {
  return (
    Math.round(
      (input.primaryMatch * PRIMARY_MATCH_WEIGHT +
        input.generalViability * GENERAL_VIABILITY_WEIGHT +
        normalizeElo(input.eloRating) * NORMALIZED_ELO_WEIGHT) *
        10,
    ) / 10
  );
}

describe("calculateDraftViabilityScore", () => {
  it("honors primary match at 40%, general viability at 30%, and normalized ELO at 30%", () => {
    expect(PRIMARY_MATCH_WEIGHT).toBe(0.4);
    expect(GENERAL_VIABILITY_WEIGHT).toBe(0.3);
    expect(NORMALIZED_ELO_WEIGHT).toBe(0.3);
    expect(
      PRIMARY_MATCH_WEIGHT + GENERAL_VIABILITY_WEIGHT + NORMALIZED_ELO_WEIGHT,
    ).toBeCloseTo(1);

    const base: DraftViabilityInput = {
      primaryMatch: 50,
      generalViability: 50,
      eloRating: DEFAULT_ELO,
    };

    const primaryBump = calculateDraftViabilityScore({
      ...base,
      primaryMatch: 60,
    });
    const generalBump = calculateDraftViabilityScore({
      ...base,
      generalViability: 60,
    });

    expect(primaryBump - calculateDraftViabilityScore(base)).toBeCloseTo(4);
    expect(generalBump - calculateDraftViabilityScore(base)).toBeCloseTo(3);

    const eloStep = (ELO_NORMALIZE_CEILING - ELO_NORMALIZE_FLOOR) / 10;
    const eloBump = calculateDraftViabilityScore({
      ...base,
      eloRating: DEFAULT_ELO + eloStep,
    });
    expect(eloBump - calculateDraftViabilityScore(base)).toBeCloseTo(3);

    expect(
      calculateDraftViabilityScore({
        primaryMatch: 80,
        generalViability: 60,
        eloRating: DEFAULT_ELO,
      }),
    ).toBe(
      viability({
        primaryMatch: 80,
        generalViability: 60,
        eloRating: DEFAULT_ELO,
      }),
    );
  });

  it("scores a 0% primary match from general viability and normalized ELO alone", () => {
    const score = calculateDraftViabilityScore({
      primaryMatch: 0,
      generalViability: 100,
      eloRating: ELO_NORMALIZE_CEILING,
    });

    expect(normalizeElo(ELO_NORMALIZE_CEILING)).toBe(100);
    expect(score).toBe(60);
    expect(score).toBe(
      viability({
        primaryMatch: 0,
        generalViability: 100,
        eloRating: ELO_NORMALIZE_CEILING,
      }),
    );
  });

  it("returns 100 when primary match, general viability, and ELO are all perfect", () => {
    expect(
      calculateDraftViabilityScore({
        primaryMatch: 100,
        generalViability: 100,
        eloRating: ELO_NORMALIZE_CEILING,
      }),
    ).toBe(100);
  });

  it("treats missing or non-finite inputs as empty rather than letting them poison the score", () => {
    const missing = {
      primaryMatch: Number.NaN,
      generalViability: undefined,
      eloRating: undefined,
    } as unknown as DraftViabilityInput;

    const empty = viability({
      primaryMatch: 0,
      generalViability: 0,
      eloRating: DEFAULT_ELO,
    });

    expect(calculateDraftViabilityScore(missing)).toBe(empty);
    expect(normalizeElo(Number.NaN)).toBe(50);
    expect(normalizeElo(Number.POSITIVE_INFINITY)).toBe(50);
    expect(
      calculateDraftViabilityScore({
        primaryMatch: Number.POSITIVE_INFINITY,
        generalViability: Number.NEGATIVE_INFINITY,
        eloRating: Number.NaN,
      }),
    ).toBe(empty);

    expect(
      calculateDraftViabilityScore({
        primaryMatch: 140,
        generalViability: -20,
        eloRating: 9000,
      }),
    ).toBe(70);
  });
});

describe("calculateNewElo K-factor", () => {
  const pass = PASS_AI_SCORE_MIN;

  it("keeps a new candidate highly volatile and locks veterans to the smallest K", () => {
    expect(kFactor(DEFAULT_ELO)).toBe(K_FACTOR_NEW);
    expect(kFactor(ESTABLISHED_TIER_ELO - 1)).toBe(K_FACTOR_NEW);
    expect(kFactor(ESTABLISHED_TIER_ELO)).toBe(K_FACTOR_ESTABLISHED);
    expect(kFactor(HIGH_TIER_ELO - 1)).toBe(K_FACTOR_ESTABLISHED);
    expect(kFactor(HIGH_TIER_ELO)).toBe(K_FACTOR_HIGH);

    expect(K_FACTOR_NEW).toBeGreaterThan(K_FACTOR_ESTABLISHED);
    expect(K_FACTOR_ESTABLISHED).toBeGreaterThan(K_FACTOR_HIGH);
    expect(K_FACTOR_HIGH).toBe(16);
  });

  it("moves a new rating farther than a veteran rating on the same win", () => {
    const newbie = DEFAULT_ELO;
    const veteran = HIGH_TIER_ELO;

    const newbieNext = calculateNewElo(newbie, newbie, pass);
    const veteranNext = calculateNewElo(veteran, veteran, pass);

    const newbieSwing = K_FACTOR_NEW * (1 - expectedScore(newbie, newbie));
    const veteranSwing = K_FACTOR_HIGH * (1 - expectedScore(veteran, veteran));

    expect(newbieNext).toBe(nextRating(newbie, 0.5, 1, K_FACTOR_NEW));
    expect(veteranNext).toBe(nextRating(veteran, 0.5, 1, K_FACTOR_HIGH));
    expect(newbieNext - newbie).toBe(Math.round(newbieSwing));
    expect(veteranNext - veteran).toBe(Math.round(veteranSwing));
    expect(newbieNext - newbie).toBeGreaterThan(veteranNext - veteran);
  });

  it("shrinks the swing again once a candidate crosses into the established tier", () => {
    const prospect = ESTABLISHED_TIER_ELO - 1;
    const established = ESTABLISHED_TIER_ELO;

    const prospectGain = calculateNewElo(prospect, prospect, pass) - prospect;
    const establishedGain =
      calculateNewElo(established, established, pass) - established;

    expect(kFactor(prospect)).toBe(K_FACTOR_NEW);
    expect(kFactor(established)).toBe(K_FACTOR_ESTABLISHED);
    expect(prospectGain).toBeGreaterThan(establishedGain);
  });
});
