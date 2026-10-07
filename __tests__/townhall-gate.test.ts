import { describe, expect, it } from "vitest";
import {
  coordinateWithDeck,
  parseTownhallAnswers,
  TOWNHALL_BASELINE,
  TOWNHALL_DECK,
  townhallCoordinate,
  TOWNHALL_STATEMENTS,
  type TownhallAnswer,
  type TownhallWeight,
} from "@/lib/onboarding/townhall";

function answers(score: number, weight: TownhallWeight): TownhallAnswer[] {
  return TOWNHALL_STATEMENTS.map((item) => ({ id: item.id, score, weight }));
}

describe("townhall gate", () => {
  it("places full support of the five statements on the left of the plane", () => {
    const point = townhallCoordinate(answers(1, "dealbreaker"));
    expect(point.x).toBeLessThan(-0.95);
    expect(point.y).toBeLessThan(-0.95);
  });

  it("places full opposition on the right of the plane", () => {
    const point = townhallCoordinate(answers(-1, "dealbreaker"));
    expect(point.x).toBeGreaterThan(0.95);
    expect(point.y).toBeGreaterThan(0.95);
  });

  it("lets a dealbreaker pull harder than low importance", () => {
    const neutral = TOWNHALL_STATEMENTS.map((item) => ({
      id: item.id,
      score: item.id === "economy" ? 1 : 0,
      weight: "medium" as const,
    }));
    const low = neutral.map((answer) =>
      answer.id === "economy" ? { ...answer, weight: "low" as const } : answer,
    );
    const hard = neutral.map((answer) =>
      answer.id === "economy" ? { ...answer, weight: "dealbreaker" as const } : answer,
    );
    expect(Math.abs(townhallCoordinate(hard).x)).toBeGreaterThan(Math.abs(townhallCoordinate(low).x));
  });

  it("requires a weight on every baseline statement", () => {
    expect(() => parseTownhallAnswers(answers(0, "medium").slice(0, 3))).toThrow(/each statement/i);
    const baseline = parseTownhallAnswers(answers(0.5, "low").slice(0, TOWNHALL_BASELINE.length));
    expect(baseline).toHaveLength(4);
    expect(baseline[0]?.score).toBe(0.5);
    const filed = parseTownhallAnswers(answers(0.5, "low"));
    expect(filed).toHaveLength(5);
  });

  it("places the four-question baseline on the plane without an immigration answer", () => {
    const baseline = TOWNHALL_BASELINE.map((item) => ({
      id: item.id,
      score: 1,
      weight: "dealbreaker" as const,
    }));
    const point = townhallCoordinate(baseline);
    expect(point.x).toBeLessThan(-0.95);
    expect(point.y).toBeLessThan(-0.95);
  });

  it("leaves the vector unchanged when a deck card is skipped", () => {
    const baseline = TOWNHALL_BASELINE.map((item) => ({
      id: item.id,
      score: 1,
      weight: "medium" as const,
    }));
    const before = townhallCoordinate(baseline);
    const skipped = coordinateWithDeck(baseline, []);
    expect(skipped).toEqual(before);

    const card = TOWNHALL_DECK[0];
    const answered = coordinateWithDeck(baseline, [
      { id: card.id, axis: card.axis, score: -1 },
    ]);
    expect(answered).not.toEqual(before);
  });
});
