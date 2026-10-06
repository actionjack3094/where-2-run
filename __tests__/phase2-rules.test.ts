import { describe, expect, it } from "vitest";
import { applyFeedLike, rankFeedItems } from "@/lib/ballot/feed";
import {
  fadedMatchPercent,
  matchConfidenceLabel,
  stanceIsStale,
  STANCE_STALE_MS,
} from "@/lib/ballot/fading";
import { districtGauntletDue } from "@/lib/debates/gauntlet";
import { cleanRoundText, DEBATE_ROUNDS, ROUND_CHAR_LIMIT, TOTAL_ROUNDS } from "@/lib/debates/structure";
import { decidePledge, splitBacking, transparencySpeech, uncapturedCredit } from "@/lib/pledges/backing";
import { hubSpokeAllows, tier2Allows } from "@/lib/platform/tier2";

const day = 24 * 60 * 60 * 1000;

describe("debate structure", () => {
  it("names four rounds and caps each at 500 characters", () => {
    expect(TOTAL_ROUNDS).toBe(4);
    expect(DEBATE_ROUNDS.map((round) => round.label)).toEqual([
      "Opening Statement",
      "Rebuttal 1",
      "Rebuttal 2",
      "Closing Statement",
    ]);
    expect(cleanRoundText("a".repeat(ROUND_CHAR_LIMIT), "Opening Statement")).toEqual({
      text: "a".repeat(ROUND_CHAR_LIMIT),
    });
    expect(cleanRoundText("a".repeat(ROUND_CHAR_LIMIT + 1), "Opening Statement")).toEqual({
      error: "Opening Statement is 500 characters at most.",
    });
  });
});

describe("district gauntlet", () => {
  const primaryDate = "2027-06-01T00:00:00.000Z";

  it("opens for an unopposed incumbent inside 45 days of the filing deadline", () => {
    const due = districtGauntletDue({
      primaryDate,
      contenders: 1,
      now: Date.parse("2027-02-05T00:00:00.000Z"),
    });
    expect(due).toBe(true);
  });

  it("stays closed when a second contender is in the race", () => {
    expect(
      districtGauntletDue({
        primaryDate,
        contenders: 2,
        now: Date.parse("2027-02-05T00:00:00.000Z"),
      }),
    ).toBe(false);
  });
});

describe("ideological fading", () => {
  it("marks a stance stale after 90 days and drops the match label", () => {
    const now = Date.parse("2026-10-06T00:00:00.000Z");
    expect(stanceIsStale(new Date(now - STANCE_STALE_MS).toISOString(), now)).toBe(true);
    expect(stanceIsStale(new Date(now - 10 * day).toISOString(), now)).toBe(false);
    expect(matchConfidenceLabel(93, true)).toBe("78% Match · Stance Stale");
    expect(fadedMatchPercent(93, false)).toBe(93);
  });
});

describe("feed likes", () => {
  it("raises reach and leaves Civic Standing unchanged", () => {
    expect(applyFeedLike({ likes: 4, civicStanding: 80 })).toEqual({
      likes: 5,
      civicStanding: 80,
    });
    expect(
      rankFeedItems([
        { kind: "debate", id: "d", likes: 1, createdAt: "2026-10-06T00:00:00.000Z" },
        { kind: "soapbox", id: "s", likes: 9, createdAt: "2026-10-01T00:00:00.000Z" },
      ]).map((item) => item.id),
    ).toEqual(["s", "d"]);
  });
});

describe("institutional backing", () => {
  it("splits the war chest, publishes a transparency line, and refunds uncaptured pledges", () => {
    const split = splitBacking(30, 70);
    expect(split.grassrootsShare).toBeCloseTo(0.3);
    expect(split.institutionalShare).toBeCloseTo(0.7);
    expect(transparencySpeech(10000, "Texas Teachers Union")).toBe(
      "Accepted $10,000 from the Texas Teachers Union.",
    );
    expect(decidePledge({ status: "pending", decision: "rejected" })).toMatchObject({
      unbought: true,
      publish: false,
    });
    expect(
      uncapturedCredit([
        { amount: 10, status: "pledged" },
        { amount: 25, status: "captured" },
      ]),
    ).toBe(10);
  });
});

describe("tier 2 and hub-and-spoke", () => {
  it("requires identity plus a voter-file match, and blocks voter replies", () => {
    expect(
      tier2Allows({ isVerified: true, tier2Status: "unverified", homeOcdIds: ["ocd-division/country:us"] }),
    ).toBe(true);
    expect(tier2Allows({ isVerified: true, tier2Status: "verified", homeOcdIds: [] })).toBe(false);
    expect(hubSpokeAllows("voter", "ask")).toBe(true);
    expect(hubSpokeAllows("voter", "reply")).toBe(false);
    expect(hubSpokeAllows("candidate", "reply")).toBe(true);
  });
});
