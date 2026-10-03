import { describe, expect, it } from "vitest";
import { ANSWER_MAX, QUESTION_MAX, cleanTownHallText } from "@/lib/platform/town-hall";

describe("town hall text", () => {
  it("keeps a constituent question inside 280 characters", () => {
    expect(cleanTownHallText("  Why this bill?  ", QUESTION_MAX)).toBe("Why this bill?");
    expect(cleanTownHallText("", QUESTION_MAX)).toBeNull();
    expect(cleanTownHallText("a".repeat(281), QUESTION_MAX)).toBeNull();
    expect(cleanTownHallText("a".repeat(ANSWER_MAX), ANSWER_MAX)).toHaveLength(ANSWER_MAX);
  });
});
