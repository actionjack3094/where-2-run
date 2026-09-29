import { describe, expect, it } from "vitest";
import { isSimUsername, roundPairs, turnFor, type ArgumentRow } from "@/lib/debates/round-state";

const A = "a-id";
const B = "b-id";
const debate = { candidate_a_id: A, candidate_b_id: B, current_round: 1 };

describe("round state", () => {
  it("is A's turn before anything is filed", () => {
    expect(turnFor([], debate)).toBe("a");
  });

  it("is B's turn once A has opened, and keeps A's text", () => {
    const rows: ArgumentRow[] = [{ author_id: A, round_number: 1, content: "Opening" }];
    expect(turnFor(rows, debate)).toBe("b");
    expect(roundPairs(rows, debate)).toEqual([{ round: 1, a: "Opening", b: null }]);
  });

  it("keeps both cards after the round advances", () => {
    const rows: ArgumentRow[] = [
      { author_id: A, round_number: 1, content: "Opening" },
      { author_id: B, round_number: 1, content: "Counter" },
    ];
    const next = { ...debate, current_round: 2 };
    expect(turnFor(rows, next)).toBe("a");
    expect(roundPairs(rows, next)).toEqual([
      { round: 1, a: "Opening", b: "Counter" },
      { round: 2, a: null, b: null },
    ]);
  });

  it("reads legacy round-1 text from the mirror columns", () => {
    const legacy = { ...debate, candidate_a_argument: "Old opening" };
    expect(turnFor([], legacy)).toBe("b");
    const rows: ArgumentRow[] = [{ author_id: B, round_number: 1, content: "Counter" }];
    expect(roundPairs(rows, legacy)[0]).toEqual({ round: 1, a: "Old opening", b: "Counter" });
  });

  it("does not reuse a stale mirror column for later rounds", () => {
    const rows: ArgumentRow[] = [
      { author_id: A, round_number: 1, content: "Opening" },
      { author_id: B, round_number: 1, content: "Counter" },
    ];
    const next = { ...debate, current_round: 2, candidate_a_argument: "Opening" };
    expect(turnFor(rows, next)).toBe("a");
  });

  it("recognises sim bots by username", () => {
    expect(isSimUsername("sim-rights-litigator")).toBe(true);
    expect(isSimUsername("runner-1a2b3c")).toBe(false);
  });
});
