import { describe, expect, it } from "vitest";
import { OPENING_CHAR_LIMIT, REBUTTAL_WINDOW_MS } from "@/lib/debates/clash";
import { cleanOpeningText } from "@/lib/debates/structure";
import {
  DIAGNOSTIC_LENGTH,
  diagnosticCoordinate,
  factionTitle,
  matchConfidence,
  nextDiagnosticQuestion,
  type DiagnosticAnswer,
} from "@/lib/onboarding/diagnostic";

function walk(pick: "left" | "right") {
  const answers: DiagnosticAnswer[] = [];
  for (let step = 0; step < DIAGNOSTIC_LENGTH; step += 1) {
    const node = nextDiagnosticQuestion(answers);
    expect(node).not.toBeNull();
    const choice = node!.choices.find((item) => item.id.endsWith(pick === "left" ? "-left" : "-right"));
    expect(choice).toBeTruthy();
    answers.push({
      id: node!.id,
      axis: node!.axis,
      choiceId: choice!.id,
      score: choice!.score,
    });
  }
  expect(nextDiagnosticQuestion(answers)).toBeNull();
  return answers;
}

describe("onboarding diagnostic", () => {
  it("asks eight questions and branches with the running lean", () => {
    const left = walk("left");
    expect(left.map((answer) => answer.id)).toEqual([
      "econ-1",
      "econ-public-2",
      "econ-public-3",
      "econ-public-4",
      "gov-1",
      "gov-liberty-2",
      "gov-liberty-3",
      "gov-liberty-4",
    ]);

    const right = walk("right");
    expect(right[1].id).toBe("econ-market-2");
    expect(right[5].id).toBe("gov-order-2");
  });

  it("places a left-liberty walk in the Progressive quadrant at 68% confidence", () => {
    const point = diagnosticCoordinate(walk("left"));
    expect(point).not.toBeNull();
    expect(point!.x).toBeLessThan(0);
    expect(point!.y).toBeLessThan(0);
    expect(factionTitle(point!)).toBe("Progressive");
    expect(factionTitle({ x: 0.4, y: 0.2 })).toBe("Traditionalist");
    expect(matchConfidence(0)).toBe(0.68);
    expect(matchConfidence(8)).toBe(0.92);
  });
});

describe("two-stage clash", () => {
  it("accepts a 1,000-character opening and a 48-hour rebuttal window", () => {
    expect(OPENING_CHAR_LIMIT).toBe(1000);
    expect(REBUTTAL_WINDOW_MS).toBe(48 * 60 * 60 * 1000);
    expect("text" in cleanOpeningText("a".repeat(1000))).toBe(true);
    expect(cleanOpeningText("a".repeat(1001))).toEqual({
      error: "Opening Statement is 1000 characters at most.",
    });
  });
});
