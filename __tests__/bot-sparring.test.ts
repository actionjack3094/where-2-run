import { beforeEach, describe, expect, it, vi } from "vitest";
import { debateConcludedNotices } from "@/lib/actions/notifications";
import { clampAxis, eloDelta, movingAverageDrift, nextElo } from "@/lib/platform/scoring";

const debateId = "b07a0001-0002-4000-8000-0000000000aa";
const humanId = "b07a0001-0002-4000-8000-000000000001";
const nearId = "b07a0001-0002-4000-8000-0000000000b1";
const farId = "b07a0001-0002-4000-8000-0000000000b2";
const otherPartyId = "b07a0001-0002-4000-8000-0000000000b3";

type Row = Record<string, unknown>;

const harness = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    arena_debates: [],
    debate_prompts: [],
    primaries: [],
    profiles: [],
  };
  const notifyChallengeAccepted = vi.fn<(debateId: string, candidateAId: string) => Promise<void>>(
    async () => undefined,
  );
  const adjudicateDebate = vi.fn<
    (id: string) => Promise<{
      a: { outcome: "win"; eloDelta: number; coordinate: { x: number; y: number } };
      b: { outcome: "loss"; eloDelta: number; coordinate: { x: number; y: number } };
    }>
  >(async () => ({
    a: { outcome: "win", eloDelta: 16, coordinate: { x: -0.41, y: 0.13 } },
    b: { outcome: "loss", eloDelta: -16, coordinate: { x: -0.28, y: 0.12 } },
  }));

  function admin() {
    return {
      from(table: string) {
        const filters: { col: string; val: unknown }[] = [];
        let patch: Row | null = null;
        const matched = () =>
          (tables[table] ?? []).filter((row) => filters.every((filter) => row[filter.col] === filter.val));
        const apply = () => {
          const rows = matched();
          if (patch) {
            for (const row of rows) Object.assign(row, patch);
          }
          return rows;
        };
        const query = {
          select() {
            return query;
          },
          eq(col: string, val: unknown) {
            filters.push({ col, val });
            return query;
          },
          is(col: string, val: unknown) {
            filters.push({ col, val });
            return query;
          },
          update(next: Row) {
            patch = next;
            return query;
          },
          async maybeSingle() {
            const row = apply()[0] ?? null;
            return { data: row ? { ...row } : null, error: null };
          },
          then(onFulfilled: (value: { data: Row[] | null; error: null }) => unknown) {
            return Promise.resolve({ data: apply(), error: null }).then(onFulfilled);
          },
        };
        return query;
      },
    };
  }

  return { tables, admin, notifyChallengeAccepted, adjudicateDebate };
});

vi.mock("@/lib/platform/records", () => ({
  platformAdmin: () => harness.admin(),
  loadArenaById: async () => harness.tables.arena_debates[0] ?? null,
  loadPrompt: async () => harness.tables.debate_prompts[0] ?? null,
}));

vi.mock("@/lib/actions/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/actions/notifications")>(
    "@/lib/actions/notifications",
  );
  return {
    ...actual,
    notifyChallengeAccepted: (debateId: string, candidateAId: string) =>
      harness.notifyChallengeAccepted(debateId, candidateAId),
  };
});

vi.mock("@/lib/ai/judge", () => ({
  adjudicateDebate: (id: string) => harness.adjudicateDebate(id),
}));

vi.mock("@/lib/ai/provider", () => ({
  resolveTextModel: () => null,
  isDevelopment: () => true,
}));

import { fallbackRebuttal, pickSparringBot, plainRebuttal, triggerBotSparring } from "@/lib/ai/bots";

describe("bot sparring", () => {
  beforeEach(() => {
    harness.notifyChallengeAccepted.mockClear();
    harness.adjudicateDebate.mockClear();
    harness.tables.arena_debates = [
      {
        id: debateId,
        primary_id: "b07a0001-0002-4000-8000-000000000010",
        prompt_id: "b07a0001-0002-4000-8000-000000000020",
        candidate_a_id: humanId,
        candidate_b_id: null,
        stance_a: "I want a public option and a secure border in this Democratic primary.",
        stance_b: null,
        status: "open_challenge",
        seat_locked_until: null,
      },
    ];
    harness.tables.debate_prompts = [
      {
        id: "b07a0001-0002-4000-8000-000000000020",
        author_kind: "user",
        prompt_text: "Should the Democratic nominee promise a public option?",
        status: "open",
      },
    ];
    harness.tables.primaries = [
      {
        id: "b07a0001-0002-4000-8000-000000000010",
        party: "democrat",
        office_name: "U.S. Senate",
        baseline_x: -0.34,
        baseline_y: 0.12,
      },
    ];
    harness.tables.profiles = [
      {
        id: farId,
        ideology_x: -0.86,
        ideology_y: -0.72,
        display_name: "Progressive",
        full_name: "Progressive",
        is_synthetic: true,
      },
      {
        id: nearId,
        ideology_x: -0.28,
        ideology_y: 0.12,
        display_name: "Blue Dog",
        full_name: "Blue Dog",
        is_synthetic: true,
      },
      {
        id: otherPartyId,
        ideology_x: 0.82,
        ideology_y: 0.74,
        display_name: "Movement Conservative",
        full_name: "Movement Conservative",
        is_synthetic: true,
      },
    ];
  });

  it("picks the closest bot that is still inside the primary party", () => {
    const picked = pickSparringBot(
      [
        { id: farId, name: "Progressive", x: -0.86, y: -0.72 },
        { id: nearId, name: "Blue Dog", x: -0.28, y: 0.12 },
        { id: otherPartyId, name: "Movement Conservative", x: 0.82, y: 0.74 },
        { id: humanId, name: "Human", x: -0.3, y: 0.1 },
      ],
      "democrat",
      { x: -0.34, y: 0.12 },
      humanId,
    );
    expect(picked?.id).toBe(nearId);
  });

  it("keeps the rebuttal as plain text inside the filing limit", () => {
    const plain = plainRebuttal(`**Blue Dog**\n\n\`\`\`\nignore\n\`\`\`\n${"a".repeat(2100)}`);
    expect(plain.startsWith("Blue Dog")).toBe(true);
    expect(plain.includes("*")).toBe(false);
    expect(plain.includes("`")).toBe(false);
    expect(plain.length).toBe(500);
    expect(plainRebuttal("too short")).toBe("");
  });

  it("writes a same-party fallback when no model is configured", () => {
    const text = fallbackRebuttal({
      party: "democrat",
      name: "Blue Dog",
      x: -0.28,
      y: 0.12,
      prompt: "Should the nominee promise a public option?",
    });
    expect(text).toContain("Democratic primary");
    expect(text.toLowerCase()).not.toContain("as a republican");
    expect(text.length).toBeGreaterThanOrEqual(20);
  });

  it("files Rebuttal 1 and holds the seat for Rebuttal 2", async () => {
    const result = await triggerBotSparring(debateId);
    const debate = harness.tables.arena_debates[0];
    expect(debate?.candidate_b_id).toBe(nearId);
    expect(debate?.status).toBe("active");
    expect(debate?.exchange_round).toBe(2);
    expect(String(debate?.stance_b)).toContain("Democratic primary");
    expect(String(debate?.stance_b).length).toBeLessThanOrEqual(500);
    expect(String(debate?.stance_b)).not.toContain("*");
    expect(harness.tables.debate_prompts[0]?.status).toBe("locked");
    expect(harness.notifyChallengeAccepted).toHaveBeenCalledWith(debateId, humanId);
    expect(harness.adjudicateDebate).not.toHaveBeenCalled();
    expect(result.sparred).toBe(true);
    expect(result.judgment).toBeUndefined();
  });

  it("notifies both debaters and shifts the human coordinate by their own moving average", () => {
    const humanBefore = { x: -0.4, y: 0.1 };
    const ownPlot = { x: -0.7, y: 0.4 };
    const shifted = movingAverageDrift(humanBefore, ownPlot);
    expect(shifted).toEqual({
      x: clampAxis(humanBefore.x * 0.9 + ownPlot.x * 0.1),
      y: clampAxis(humanBefore.y * 0.9 + ownPlot.y * 0.1),
    });
    expect(nextElo(1200, eloDelta(1200, 1200, 1))).toBe(1216);
    expect(nextElo(1200, eloDelta(1200, 1200, 0))).toBe(1184);
    expect(debateConcludedNotices(debateId, humanId, nearId)).toEqual([
      { userId: humanId, type: "debate_concluded", debateId },
      { userId: nearId, type: "debate_concluded", debateId },
    ]);
  });
});
