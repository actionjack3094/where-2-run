import { describe, expect, it } from "vitest";
import {
  heuristicClassification,
  matchCatalogOcdIds,
  ocdJurisdictionalLevel,
} from "@/lib/debates/prompt-classification";
import {
  applyWaitingFloors,
  mergeFeedTimeline,
  passesViabilityGate,
  questionFloorMode,
} from "@/lib/feed/types";
import type { BlueFeedDebate, RedFeedQuestion } from "@/lib/feed/types";

const CATALOG = [
  {
    id: "house",
    ocdId: "ocd-division/country:us/state:tx/cd:37",
    officeName: "U.S. House TX-37",
  },
  {
    id: "senate",
    ocdId: "ocd-division/country:us/state:tx/sldu:14",
    officeName: "Texas Senate District 14",
  },
  {
    id: "council",
    ocdId: "ocd-division/country:us/state:tx/place:austin/council_district:9",
    officeName: "Austin City Council District 9",
  },
];

describe("prompt classification geography", () => {
  it("sorts OCD divisions into federal, state, and local", () => {
    expect(ocdJurisdictionalLevel(CATALOG[0].ocdId)).toBe("federal");
    expect(ocdJurisdictionalLevel(CATALOG[1].ocdId)).toBe("state");
    expect(ocdJurisdictionalLevel(CATALOG[2].ocdId)).toBe("local");
  });

  it("maps an Austin zoning prompt onto the council seat", () => {
    const result = heuristicClassification(
      "Austin should eliminate single-family zoning within a mile of transit.",
      CATALOG,
    );
    expect(result.jurisdictional_level).toBe("local");
    expect(result.applicable_ocd_ids).toEqual([CATALOG[2].ocdId]);
  });

  it("expands a parent state division to the federal seats inside it", () => {
    expect(
      matchCatalogOcdIds(
        ["ocd-division/country:us/state:tx"],
        "federal",
        CATALOG,
      ),
    ).toEqual([CATALOG[0].ocdId]);
  });
});

describe("dual-loop feed merge", () => {
  it("keeps composite scores at or under 50 percent out of candidate mode", () => {
    expect(passesViabilityGate(50)).toBe(false);
    expect(passesViabilityGate(50.1)).toBe(true);
  });

  it("zips candidate questions ahead of the jury debate at the same index", () => {
    const red: RedFeedQuestion = {
      loop: "red",
      id: "q1",
      createdAt: "2026-09-23T00:00:00.000Z",
      prompt: "Should the city freeze appraisals?",
      electionId: "election",
      electionSlug: "council-9",
      districtName: "Austin City Council District 9",
      jurisdictionalLevel: "local",
      primaryAxis: "economy",
      informationGainScore: 1,
      waitingDebateId: null,
      waitingOpponentName: null,
      viewerHoldsFloor: false,
    };
    const blue: BlueFeedDebate = {
      loop: "blue",
      id: "d1",
      createdAt: "2026-09-23T00:00:00.000Z",
      title: "Transit density",
      status: "voting",
      districtName: "Austin City Council District 9",
      electionSlug: "council-9",
      candidateA: { id: "a", username: "ada" },
      candidateB: { id: "b", username: "bea" },
      votingOpen: true,
    };

    expect(mergeFeedTimeline([red], [blue]).map((item) => item.loop)).toEqual([
      "red",
      "blue",
    ]);
  });

  it("treats a waiting opponent as a challenge and an empty floor as a new thread", () => {
    expect(questionFloorMode({ waitingDebateId: null, viewerHoldsFloor: false })).toBe("open");
    expect(questionFloorMode({ waitingDebateId: "debate-1", viewerHoldsFloor: false })).toBe(
      "challenge",
    );
    expect(questionFloorMode({ waitingDebateId: null, viewerHoldsFloor: true })).toBe("holding");
  });

  it("keeps a question that has zero debates so the card can open the floor", () => {
    const kept = applyWaitingFloors(
      [
        {
          id: "tx-10-question",
          waitingDebateId: null,
          waitingOpponentName: null,
          viewerHoldsFloor: false,
        },
      ],
      [],
      "viewer",
    );

    expect(kept).toHaveLength(1);
    expect(questionFloorMode(kept[0])).toBe("open");
  });
});
