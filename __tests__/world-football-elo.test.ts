import { describe, expect, it } from "vitest";
import { calculateDebateElo } from "@/lib/actions/elo";

describe("calculateDebateElo", () => {
  it("treats equal ratings as a coin flip", () => {
    const next = calculateDebateElo(
      { userId: "a", rating: 1200 },
      { userId: "b", rating: 1200 },
      { votesA: 51, votesB: 49, kFactor: 20 },
    );
    expect(next.deltaA).toBeGreaterThan(0);
    expect(next.deltaB).toBeLessThan(0);
    expect(next.newRatingA).toBe(1200 + next.deltaA);
    expect(next.newRatingB).toBe(1200 + next.deltaB);
  });

  it("moves more Elo on an 80/20 split than on a 51/49 split", () => {
    const close = calculateDebateElo(
      { userId: "a", rating: 1200 },
      { userId: "b", rating: 1200 },
      { votesA: 51, votesB: 49, kFactor: 20 },
    );
    const blowout = calculateDebateElo(
      { userId: "a", rating: 1200 },
      { userId: "b", rating: 1200 },
      { votesA: 80, votesB: 20, kFactor: 20 },
    );
    expect(blowout.deltaA).toBeGreaterThan(close.deltaA);
    expect(Math.abs(blowout.deltaB)).toBeGreaterThan(Math.abs(close.deltaB));
  });

  it("uses the supplied tournament K factor", () => {
    const early = calculateDebateElo(
      { userId: "a", rating: 1200 },
      { userId: "b", rating: 1200 },
      { votesA: 60, votesB: 40, kFactor: 20 },
    );
    const finals = calculateDebateElo(
      { userId: "a", rating: 1200 },
      { userId: "b", rating: 1200 },
      { votesA: 60, votesB: 40, kFactor: 60 },
    );
    expect(finals.deltaA).toBeGreaterThan(early.deltaA);
  });
});
