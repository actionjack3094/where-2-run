import { describe, expect, it } from "vitest";
import { inferPartisanLean } from "@/lib/ideology/match";
import { toSixAxisVector } from "@/lib/ideology/six-axis";
import { cosineDistance, normalizeVector } from "@/lib/ideology/vector";

function distanceToPrimary(
  userVector: number[],
  primaryDem: number[],
  primaryRep: number[],
) {
  const lean = inferPartisanLean(normalizeVector(userVector));
  const primary = lean === "D" ? primaryDem : primaryRep;
  return cosineDistance(toSixAxisVector(userVector), toSixAxisVector(primary));
}

describe("nationwide ideological matchmaker", () => {
  it("ranks the closer ideological primary ahead of a distant one", () => {
    const progressive = [0.9, 0.85, 0.2, 0.15, 0.9, 0.85, 0.2, 0.15, 0.9, 0.8];
    const demPrimary = [0.85, 0.8, 0.75, 0.7, 0.8, 0.65];
    const farRepPrimary = [0.1, 0.15, 0.2, 0.15, 0.1, 0.2];

    expect(inferPartisanLean(normalizeVector(progressive))).toBe("D");
    expect(distanceToPrimary(progressive, demPrimary, farRepPrimary)).toBeLessThan(
      distanceToPrimary(progressive, farRepPrimary, demPrimary),
    );
  });

  it("does not use physical location when scoring ideological distance", () => {
    const vector = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const austin = [0.6, 0.55, 0.5, 0.5, 0.55, 0.5];
    const boston = [0.6, 0.55, 0.5, 0.5, 0.55, 0.5];
    expect(cosineDistance(toSixAxisVector(vector), austin)).toBeCloseTo(
      cosineDistance(toSixAxisVector(vector), boston),
      8,
    );
  });
});
