import { describe, expect, it } from "vitest";
import { DEFAULT_ELO } from "@/lib/arena/elo";
import { sortContests, type ContestRow } from "@/lib/leaderboards/contests";
import {
  calculateDraftViabilityScore,
  ELO_NORMALIZE_CEILING,
  ELO_NORMALIZE_FLOOR,
  GENERAL_VIABILITY_WEIGHT,
  NORMALIZED_ELO_WEIGHT,
  normalizeElo,
  PRIMARY_MATCH_WEIGHT,
} from "@/lib/math/viability";

describe("calculateDraftViabilityScore", () => {
  it("weights primary match at 40%, general viability at 30%, and normalized ELO at 30%", () => {
    expect(PRIMARY_MATCH_WEIGHT).toBe(0.4);
    expect(GENERAL_VIABILITY_WEIGHT).toBe(0.3);
    expect(NORMALIZED_ELO_WEIGHT).toBe(0.3);
    expect(PRIMARY_MATCH_WEIGHT + GENERAL_VIABILITY_WEIGHT + NORMALIZED_ELO_WEIGHT).toBe(1);

    const elo = DEFAULT_ELO;
    const expected =
      80 * 0.4 + 50 * 0.3 + normalizeElo(elo) * 0.3;

    expect(
      calculateDraftViabilityScore({
        primaryMatch: 80,
        generalViability: 50,
        eloRating: elo,
      }),
    ).toBe(Math.round(expected * 10) / 10);
  });

  it("maps default ELO to the midpoint of the 0–100 scale", () => {
    expect(normalizeElo(DEFAULT_ELO)).toBe(50);
    expect(normalizeElo(ELO_NORMALIZE_FLOOR)).toBe(0);
    expect(normalizeElo(ELO_NORMALIZE_CEILING)).toBe(100);
  });

  it("clamps out-of-range inputs before mixing", () => {
    const capped = calculateDraftViabilityScore({
      primaryMatch: 140,
      generalViability: -20,
      eloRating: 9000,
    });
    const expected = 100 * 0.4 + 0 * 0.3 + 100 * 0.3;
    expect(capped).toBe(expected);
  });
});

describe("sortContests", () => {
  const rows: ContestRow[] = [
    {
      electionId: "a",
      slug: "a",
      officeName: "Alpha",
      incumbentName: null,
      districtId: null,
      districtName: null,
      historicalLean: null,
      wins: 2,
      losses: 4,
      eloRating: 1200,
      primaryMatch: 90,
      generalViability: 20,
      draftViability: 40,
      uncapturedBounty: 0,
    },
    {
      electionId: "b",
      slug: "b",
      officeName: "Bravo",
      incumbentName: null,
      districtId: null,
      districtName: null,
      historicalLean: null,
      wins: 8,
      losses: 1,
      eloRating: 1800,
      primaryMatch: 40,
      generalViability: 85,
      draftViability: 70,
      uncapturedBounty: 0,
    },
  ];

  it("sorts by primary alignment, general win probability, and debate dominance", () => {
    expect(sortContests(rows, "primary")[0]?.slug).toBe("a");
    expect(sortContests(rows, "general")[0]?.slug).toBe("b");
    expect(sortContests(rows, "debate")[0]?.slug).toBe("b");
  });
});
