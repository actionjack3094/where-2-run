import { describe, expect, it } from "vitest";
import {
  adherenceScore,
  driftCoordinate,
  eloDelta,
  euclidean,
  matchPrimaries,
  partyFromCoordinate,
  percentileRank,
  tierForStanding,
  withinTieMargin,
} from "@/lib/platform/scoring";
import { coordinateFromAnswers } from "@/lib/platform/questions";

describe("platform scoring", () => {
  it("measures distance on the ideology plane", () => {
    expect(euclidean({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("assigns party from the economic axis", () => {
    expect(partyFromCoordinate({ x: -0.2, y: 0.4 })).toBe("democrat");
    expect(partyFromCoordinate({ x: 0, y: -0.4 })).toBe("republican");
  });

  it("ties a margin at or under 3 percent", () => {
    expect(withinTieMargin(0.9, 0.92)).toBe(true);
    expect(withinTieMargin(0.5, 0.7)).toBe(false);
  });

  it("moves Elo toward the result and ignores the opponent when drifting", () => {
    const delta = eloDelta(1200, 1200, 1);
    expect(delta).toBe(16);
    const next = driftCoordinate({ x: -0.4, y: -0.2 }, { x: -0.8, y: -0.6 }, 1, 0);
    expect(next.x).toBeLessThan(-0.4);
    expect(next.y).toBeLessThan(-0.2);
  });

  it("does not use an opponent score as a drift input", () => {
    const own = driftCoordinate({ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.4 }, 0.5, 3);
    const again = driftCoordinate({ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.4 }, 0.5, 3);
    expect(own).toEqual(again);
  });

  it("widens until an open seat is inside the radius", () => {
    const matched = matchPrimaries(
      { x: 0.1, y: 0.1 },
      [
        { x: 0.15, y: 0.1, party: "republican", openSeats: 0, id: "near" },
        { x: 0.9, y: 0.8, party: "republican", openSeats: 1, id: "far" },
        { x: -0.8, y: -0.2, party: "democrat", openSeats: 4, id: "other" },
      ],
    );
    expect(matched.map((row) => row.primary.id)).toEqual(["near", "far"]);
  });

  it("requires verification for declared and frontrunner tiers", () => {
    const field = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];
    expect(tierForStanding(1900, field, false, "Ada Lovelace")).toBe("pundit");
    expect(tierForStanding(1600, field, true, "Ada Lovelace")).toBe("declared_candidate");
    expect(tierForStanding(1900, field, true, "Ada Lovelace")).toBe("frontrunner");
    expect(percentileRank(1900, field)).toBe(0.9);
  });

  it("averages six economic and six social answers", () => {
    const answers = [-1, -1, -1, -1, -1, -1, 1, 1, 1, 1, 1, 1];
    expect(coordinateFromAnswers(answers)).toEqual({ x: -1, y: 1 });
    expect(adherenceScore({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(1);
  });
});
