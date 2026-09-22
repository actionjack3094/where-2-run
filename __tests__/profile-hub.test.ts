import { describe, expect, it } from "vitest";
import {
  FEC_FORM_1_HREF,
  TEXAS_FORM_CTA_HREF,
  treasurerFilingLink,
} from "@/lib/compliance/treasurer";
import {
  ideologicalCompatibilityPercent,
  toSixAxisVector,
} from "@/lib/ideology/six-axis";

describe("ideologicalCompatibilityPercent", () => {
  it("returns 100 when two six-axis vectors are identical", () => {
    const vector = [0.2, 0.4, 0.6, 0.8, 0.1, 0.9];
    expect(ideologicalCompatibilityPercent(vector, [...vector])).toBe(100);
  });

  it("drops as the vectors move apart", () => {
    const origin = toSixAxisVector([0, 0, 0, 0, 0, 0]);
    const far = toSixAxisVector([1, 1, 1, 1, 1, 1]);
    const near = toSixAxisVector([0.1, 0, 0, 0, 0, 0]);
    const farScore = ideologicalCompatibilityPercent(origin, far);
    const nearScore = ideologicalCompatibilityPercent(origin, near);
    expect(farScore).toBe(0);
    expect(nearScore).not.toBeNull();
    expect(nearScore!).toBeGreaterThan(farScore!);
  });

  it("returns null when either coordinate is missing", () => {
    expect(ideologicalCompatibilityPercent([], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5])).toBeNull();
  });
});

describe("treasurerFilingLink", () => {
  it("links a federal election to FEC Form 1", () => {
    expect(treasurerFilingLink({ level: "federal", state: "TX" })).toMatchObject({
      href: FEC_FORM_1_HREF,
      label: "FEC Form 1",
    });
  });

  it("links a Texas election to Form CTA", () => {
    expect(treasurerFilingLink({ level: "local", state: "Texas" })).toMatchObject({
      href: TEXAS_FORM_CTA_HREF,
      label: "Texas Form CTA",
    });
  });

  it("returns no official form for a non-Texas state race", () => {
    expect(treasurerFilingLink({ level: "state", state: "CA" })).toBeNull();
  });
});
