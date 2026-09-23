import { describe, expect, it } from "vitest";
import { ocdFenceSpecificity } from "@/lib/civic-fencing";
import { rankViableRaces } from "@/lib/onboarding/draft-races";
import { calculateDraftViabilityScore } from "@/lib/math/viability";

const AUSTIN = [
  "ocd-division/country:us",
  "ocd-division/country:us/state:tx",
  "ocd-division/country:us/state:tx/cd:37",
  "ocd-division/country:us/state:tx/sldu:14",
  "ocd-division/country:us/state:tx/sldl:49",
  "ocd-division/country:us/state:tx/place:austin",
  "ocd-division/country:us/state:tx/place:austin/council_district:9",
];

describe("ocdFenceSpecificity", () => {
  it("scores an exact OCD id above a same-state name match", () => {
    expect(
      ocdFenceSpecificity({
        ocdIds: AUSTIN,
        electionOcdId: "ocd-division/country:us/state:tx/place:austin/council_district:9",
        officeName: "Austin City Council, District 9",
        districtState: "TX",
      }),
    ).toBe(100);

    expect(
      ocdFenceSpecificity({
        ocdIds: AUSTIN,
        officeName: "Texas 37th Congressional District",
        districtState: "TX",
      }),
    ).toBe(90);

    expect(
      ocdFenceSpecificity({
        ocdIds: AUSTIN,
        officeName: "Oakland City Council, District 3",
        districtState: "CA",
      }),
    ).toBe(0);
  });
});

describe("rankViableRaces", () => {
  it("orders fenced races by calculateDraftViabilityScore and drops seats outside the fence", () => {
    const aligned = [1, 1, 1, 1, 1, 1];
    const opposed = [0, 0, 0, 0, 0, 0];
    const races = rankViableRaces({
      ocdIds: AUSTIN,
      ideologyVector: aligned,
      eloRating: 1200,
      races: [
        {
          id: "opposed-council",
          slug: "austin-d9-opposed",
          officeName: "Austin City Council, District 9",
          incumbentName: null,
          ocdId: "ocd-division/country:us/state:tx/place:austin/council_district:9",
          districtName: "Austin City Council District 9",
          districtState: "TX",
          pviScore: 0,
          medianVoterVector: opposed,
        },
        {
          id: "aligned-council",
          slug: "austin-d9",
          officeName: "Austin City Council, District 9",
          incumbentName: "Zohaib Qadri",
          ocdId: "ocd-division/country:us/state:tx/place:austin/council_district:9",
          districtName: "Austin City Council District 9",
          districtState: "TX",
          pviScore: 0,
          medianVoterVector: aligned,
        },
        {
          id: "oakland",
          slug: "oakland-d3",
          officeName: "Oakland City Council, District 3",
          incumbentName: null,
          ocdId: null,
          districtName: "Oakland City Council District 3",
          districtState: "CA",
          pviScore: 0,
          medianVoterVector: aligned,
        },
      ],
    });

    expect(races.map((race) => race.electionId)).toEqual(["aligned-council", "opposed-council"]);
    expect(races[0]?.viability).toBeGreaterThan(races[1]?.viability ?? 0);
    expect(races[0]?.viability).toBe(
      calculateDraftViabilityScore({
        primaryMatch: races[0]?.primaryMatch ?? 0,
        generalViability: races[0]?.generalViability ?? 0,
        eloRating: 1200,
      }),
    );
  });
});
