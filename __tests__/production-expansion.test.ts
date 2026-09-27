import { describe, expect, it } from "vitest";
import {
  mapDemocracyWorksElections,
  mapGoogleCivicElections,
} from "@/lib/civic/election-cycles";
import { assignConstituentDistrict } from "@/lib/civic/district-routing";
import { classifyOcdLevel } from "@/lib/civic-fencing";
import {
  arbitrationKindForReport,
  debatesToFinalize,
  debatesToHold,
  debatesToRelease,
  isAbandonedDebate,
  juryResolutionPlan,
} from "@/lib/moderation/arbitration";
import {
  constituentsInDistrict,
  countdownDebates,
  digestCopy,
  freshChallenges,
} from "@/lib/notifications/digests";
import { clip } from "@/lib/og/card";
import {
  ballotOcdError,
  governmentIdReferenceError,
} from "@/lib/verification/tier3";

const NOW = new Date("2026-09-27T12:00:00.000Z");

describe("OCD election cycles", () => {
  it("classifies federal, state, and municipal divisions", () => {
    expect(classifyOcdLevel("ocd-division/country:us")).toBe("federal");
    expect(classifyOcdLevel("ocd-division/country:us/state:tx/cd:37")).toBe("federal");
    expect(classifyOcdLevel("ocd-division/country:us/state:tx/sldu:14")).toBe("state");
    expect(classifyOcdLevel("ocd-division/country:us/state:tx/place:austin")).toBe(
      "municipal",
    );
  });

  it("maps Google Civic elections onto OCD cycles", () => {
    const cycles = mapGoogleCivicElections({
      elections: [
        {
          id: "2000",
          name: "Texas Primary",
          electionDay: "2026-03-03",
          ocdDivisionId: "ocd-division/country:us/state:tx",
        },
        { id: "", name: "Dropped", electionDay: "2026-03-03" },
      ],
    });

    expect(cycles).toEqual([
      {
        source: "google_civic",
        externalId: "2000",
        name: "Texas Primary",
        electionDay: "2026-03-03",
        ocdId: "ocd-division/country:us/state:tx",
        level: "state",
      },
    ]);
  });

  it("maps a Democracy Works election onto each division", () => {
    const cycles = mapDemocracyWorksElections({
      elections: [
        {
          id: "vip-9",
          description: "Austin council",
          date: "2026-11-03",
          "district-divisions": [
            { "ocd-id": "ocd-division/country:us/state:tx/place:austin" },
            { "ocd-id": "ocd-division/country:us/state:tx" },
          ],
        },
      ],
    });

    expect(cycles.map((cycle) => cycle.level)).toEqual(["municipal", "state"]);
    expect(cycles[0]?.externalId).toBe(
      "vip-9::ocd-division/country:us/state:tx/place:austin",
    );
  });
});

describe("district routing", () => {
  it("assigns the most specific district on the address", () => {
    const assignment = assignConstituentDistrict({
      ocdIds: [
        "ocd-division/country:us",
        "ocd-division/country:us/state:tx",
        "ocd-division/country:us/state:tx/place:austin/council_district:9",
      ],
      districts: [
        { id: "state", ocdId: "ocd-division/country:us/state:tx" },
        {
          id: "council",
          ocdId: "ocd-division/country:us/state:tx/place:austin/council_district:9",
        },
      ],
    });

    expect(assignment.districtId).toBe("council");
    expect(assignment.municipal).toHaveLength(1);
    expect(assignment.federal).toEqual(["ocd-division/country:us"]);
  });

  it("falls back to the election seat when no district row matches", () => {
    const assignment = assignConstituentDistrict({
      ocdIds: ["ocd-division/country:us/state:tx/cd:10"],
      districts: [],
      elections: [
        {
          ocdId: "ocd-division/country:us/state:tx/cd:10",
          districtId: "tx-10",
        },
      ],
    });

    expect(assignment.districtId).toBe("tx-10");
    expect(assignment.primaryOcdId).toBe("ocd-division/country:us/state:tx/cd:10");
  });
});

describe("geofenced digests", () => {
  const debate = {
    id: "debate-1",
    topic: "Housing",
    status: "voting",
    expiresAt: "2026-09-28T00:00:00.000Z",
    createdAt: "2026-09-27T08:00:00.000Z",
    ocdId: "ocd-division/country:us/state:tx/cd:37",
    candidateAId: "a",
    candidateBId: "b",
  };

  it("keeps countdowns inside the next 24 hours and challenges from the last day", () => {
    expect(countdownDebates([debate], NOW)).toHaveLength(1);
    expect(
      freshChallenges([{ ...debate, status: "active" }], NOW).map((row) => row.id),
    ).toEqual(["debate-1"]);
    expect(
      countdownDebates([{ ...debate, expiresAt: "2026-09-30T00:00:00.000Z" }], NOW),
    ).toHaveLength(0);
  });

  it("mails only constituents of the target division, not the candidates", () => {
    const people = constituentsInDistrict(
      [
        { id: "local", ocdIdentifiers: ["ocd-division/country:us/state:tx/cd:37"] },
        { id: "a", ocdIdentifiers: ["ocd-division/country:us/state:tx/cd:37"] },
        { id: "outsider", ocdIdentifiers: ["ocd-division/country:us/state:tx/cd:10"] },
      ],
      debate.ocdId,
      ["a", "b"],
    );

    expect(people.map((person) => person.id)).toEqual(["local"]);
    expect(
      digestCopy({
        kind: "debate_countdown",
        topic: "Housing",
        districtLabel: "Texas's 37th Congressional District",
        hoursRemaining: 12,
      }),
    ).toContain("closes in 12 hours");
  });
});

describe("tier 3 references", () => {
  it("rejects a full government ID number and accepts a review token", () => {
    expect(governmentIdReferenceError("123-45-6789")).toMatch(/not a full government ID/);
    expect(governmentIdReferenceError("TX-DL-4821")).toBeNull();
    expect(ballotOcdError("ocd-division/country:us/state:tx/cd:37")).toBeNull();
  });
});

describe("jury holds", () => {
  const voting = {
    id: "voting",
    status: "voting",
    candidateAId: "a",
    candidateBId: "b",
    expiresAt: "2026-09-27T01:00:00.000Z",
    argumentCount: 2,
  };
  const abandoned = {
    id: "abandoned",
    status: "matching",
    candidateAId: "a",
    candidateBId: null,
    expiresAt: "2026-09-27T01:00:00.000Z",
    argumentCount: 0,
  };

  it("holds abandoned floors and finalizes clean ballots", () => {
    expect(isAbandonedDebate(abandoned, NOW)).toBe(true);
    expect(isAbandonedDebate(voting, NOW)).toBe(false);
    const floors = [voting, abandoned];
    expect(debatesToHold(floors, new Set(), new Set(), NOW)).toEqual(["abandoned"]);
    expect(debatesToFinalize(floors, new Set(["voting"]), NOW)).toEqual([]);
    expect(debatesToFinalize(floors, new Set(), NOW)).toEqual(["voting"]);
    expect(debatesToRelease(floors, new Set(), new Set(["abandoned"]), NOW)).toEqual([
      "abandoned",
    ]);
  });

  it("opens an ELO hold for bad-faith arguments and flagged votes", () => {
    expect(
      arbitrationKindForReport({ targetKind: "argument", reason: "bad_faith" }),
    ).toBe("bad_faith_argument");
    expect(arbitrationKindForReport({ targetKind: "vote", reason: "spam" })).toBe(
      "flagged_vote",
    );
    expect(arbitrationKindForReport({ targetKind: "debate", reason: "other" })).toBeNull();
  });

  it("voids a flagged ballot on uphold and expires a tainted floor", () => {
    expect(juryResolutionPlan("flagged_vote", "uphold")).toMatchObject({
      voidFlaggedVote: true,
      holdsElo: false,
      debateStatus: "unchanged",
    });
    expect(juryResolutionPlan("abandoned_debate", "uphold").debateStatus).toBe("expired");
    expect(juryResolutionPlan("bad_faith_argument", "dismiss").holdsElo).toBe(false);
  });
});

describe("share cards", () => {
  it("clips long matchup titles", () => {
    expect(clip("Housing bond", 40)).toBe("Housing bond");
    expect(clip("a".repeat(20), 8)).toBe("aaaaaaa…");
  });
});
