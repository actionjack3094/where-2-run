import { describe, expect, it } from "vitest";
import {
  applyWedge,
  CALIBRATION_QUESTIONS,
  CALIBRATION_TOAST,
  confidenceAfterAnswer,
  confidenceFill,
  CONFIDENCE_CAP,
  presentWedge,
  readCalibrationAnswered,
  wedgeContext,
} from "@/lib/townhall/calibration";

const wealth = CALIBRATION_QUESTIONS.find((question) => question.id === "wealth-tax")!;
const privacy = CALIBRATION_QUESTIONS.find((question) => question.id === "privacy")!;
const zoning = CALIBRATION_QUESTIONS.find((question) => question.id === "zoning")!;

describe("townhall calibration", () => {
  it("moves a left-coded favor answer toward the economic left", () => {
    const next = applyWedge({ x: 0.2, y: 0.1 }, wealth, "strongly_favor");
    expect(next.x).toBeCloseTo(0.15, 4);
    expect(next.y).toBeCloseTo(0.1, 4);
  });

  it("moves opposition the other way, and a lean answer a shorter step", () => {
    const oppose = applyWedge({ x: 0, y: 0 }, wealth, "strongly_oppose");
    const lean = applyWedge({ x: 0, y: 0 }, wealth, "lean_yes");
    expect(oppose.x).toBeCloseTo(0.05, 4);
    expect(Math.abs(lean.x)).toBeLessThan(Math.abs(oppose.x));
    expect(lean.x).toBeCloseTo(-0.02, 4);
  });

  it("adjusts the social axis without touching the economic coordinate", () => {
    const next = applyWedge({ x: -0.4, y: 0.3 }, privacy, "strongly_favor");
    expect(next.x).toBeCloseTo(-0.4, 4);
    expect(next.y).toBeCloseTo(0.25, 4);
  });

  it("clamps the plane at the edge", () => {
    const next = applyWedge({ x: 0.98, y: -1 }, wealth, "strongly_oppose");
    expect(next.x).toBe(1);
    expect(next.y).toBe(-1);
  });

  it("adds 4 points from the onboarding floor and stops at 96%", () => {
    const first = confidenceAfterAnswer(null);
    expect(first.score).toBeCloseTo(0.72, 2);
    expect(first.toast).toBe(CALIBRATION_TOAST);

    const partial = confidenceAfterAnswer(0.94);
    expect(partial.score).toBe(CONFIDENCE_CAP);
    expect(partial.toast).toBe("Vector calibrated. Confidence is at 96%.");

    const held = confidenceAfterAnswer(0.96);
    expect(held.score).toBe(0.96);
    expect(held.gained).toBe(false);
    expect(held.toast).toBe("Vector calibrated. Confidence is holding at 96%.");
  });

  it("scales the meter from 68% to 100%", () => {
    expect(confidenceFill(0.68)).toBe(0);
    expect(confidenceFill(0.96)).toBeCloseTo(87.5, 4);
    expect(confidenceFill(1)).toBe(100);
  });

  it("names a House match when the profile has a district", () => {
    expect(wedgeContext(zoning, "TX-10")).toBe("Calibrating your U.S. House TX-10 Match");
    expect(wedgeContext(zoning, null)).toBe("Refining your Economic Axis");
    expect(presentWedge(privacy, "TX-10").context).toBe("Refining your Social Axis");
  });

  it("reads only known calibration ids", () => {
    expect(
      readCalibrationAnswered({
        townhall: { answers: [] },
        calibration: { answered: ["zoning", "not-a-card", "privacy", "zoning"] },
      }),
    ).toEqual(["privacy", "zoning"]);
  });
});
