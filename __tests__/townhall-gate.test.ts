import { describe, expect, it } from "vitest";
import {
  parseTownhallAnswers,
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

  it("requires a weight on every statement", () => {
    expect(() => parseTownhallAnswers(answers(0, "medium").slice(0, 4))).toThrow(/each statement/i);
    const filed = parseTownhallAnswers(answers(0.5, "low"));
    expect(filed).toHaveLength(5);
    expect(filed[0]?.score).toBe(0.5);
  });
});
