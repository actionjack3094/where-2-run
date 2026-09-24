import { describe, expect, it } from "vitest";
import { ocdFenceSpecificity } from "@/lib/civic-fencing";
import { isFederalDraftSeat, rankViableRaces } from "@/lib/onboarding/draft-races";
import { calculateDraftViability } from "@/lib/math/viability";

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
  it("orders fenced races by the primary-general funnel and drops seats outside the fence", () => {
    const aligned = [1, 1, 1, 1, 1, 1];
    const opposed = [0, 0, 0, 0, 0, 0];
    const races = rankViableRaces({
      ocdIds: AUSTIN,
      ideologyVector: aligned,
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
    expect(races[0]?.lane).toBe("D");
    expect(races[0]?.generalPath).toBe("Toss-up");
    expect(races[0]?.viability).toBe(
      calculateDraftViability({
        ideologyVector: aligned,
        primaryRepVector: undefined,
        primaryDemVector: undefined,
        generalVector: aligned,
        pviScore: 0,
      }).viability,
    );
  });

  it("keeps only the highest nationwide House seat, so a winnable seat beats an unwinnable one", () => {
    const conservative = [0.12, 0.1, 0.08, 0.11, 0.14, 0.16];
    const tx37 = {
      id: "tx-37",
      slug: "tx-us-house-37-2026",
      officeName: "U.S. House Texas District 37",
      incumbentName: "Lloyd Doggett",
      ocdId: "ocd-division/country:us/state:tx/cd:37",
      districtName: "U.S. House Texas District 37",
      districtState: "TX",
      pviScore: -0.48,
      medianVoterVector: [0.72, 0.68, 0.64, 0.7, 0.75, 0.55],
      primaryRepVector: [0.22, 0.2, 0.16, 0.18, 0.24, 0.26],
      primaryDemVector: [0.9, 0.88, 0.82, 0.86, 0.92, 0.74],
      generalVector: [0.72, 0.68, 0.64, 0.7, 0.75, 0.55],
    };
    const tx10 = {
      id: "tx-10",
      slug: "tx-us-house-10-2026",
      officeName: "U.S. House Texas District 10",
      incumbentName: "Michael McCaul",
      ocdId: "ocd-division/country:us/state:tx/cd:10",
      districtName: "U.S. House Texas District 10",
      districtState: "TX",
      pviScore: 0.26,
      medianVoterVector: [0.32, 0.28, 0.26, 0.3, 0.34, 0.36],
      primaryRepVector: [0.1, 0.12, 0.08, 0.1, 0.14, 0.16],
      primaryDemVector: [0.8, 0.78, 0.74, 0.76, 0.82, 0.68],
      generalVector: [0.32, 0.28, 0.26, 0.3, 0.34, 0.36],
    };
    const races = rankViableRaces({
      ocdIds: [...AUSTIN, "ocd-division/country:us/state:tx/cd:10"],
      ideologyVector: conservative,
      races: [tx37, tx10],
    });

    const tx10Score = calculateDraftViability({
      ideologyVector: conservative,
      primaryRepVector: tx10.primaryRepVector,
      primaryDemVector: tx10.primaryDemVector,
      generalVector: tx10.generalVector,
      pviScore: tx10.pviScore,
    });
    const tx37Score = calculateDraftViability({
      ideologyVector: conservative,
      primaryRepVector: tx37.primaryRepVector,
      primaryDemVector: tx37.primaryDemVector,
      generalVector: tx37.generalVector,
      pviScore: tx37.pviScore,
    });

    expect(tx10Score.viability).toBeGreaterThan(tx37Score.viability);
    expect(races.map((race) => race.electionId)).toEqual(["tx-10"]);
    expect(races[0]?.lane).toBe("R");
    expect(races[0]?.generalPath).toBe("Safe R");
    expect(races[0]?.generalViability ?? 0).toBeGreaterThan(70);
  });

  it("bypasses the home-state fence for US House and still fences state and local races", () => {
    const aligned = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const opposed = [0, 0, 0, 0, 0, 0];
    expect(
      isFederalDraftSeat({
        ocdId: "ocd-division/country:us/state:mi/cd:7",
        officeName: "U.S. House Michigan District 7",
        districtName: "U.S. House Michigan District 7",
      }),
    ).toBe(true);
    expect(
      isFederalDraftSeat({
        ocdId: "ocd-division/country:us/state:tx/sldu:14",
        officeName: "Texas State Senate District 14",
        districtName: "Texas State Senate District 14",
      }),
    ).toBe(false);

    const races = rankViableRaces({
      ocdIds: AUSTIN,
      ideologyVector: aligned,
      races: [
        {
          id: "tx-37",
          slug: "tx-us-house-37-2026",
          officeName: "U.S. House Texas District 37",
          incumbentName: "Lloyd Doggett",
          ocdId: "ocd-division/country:us/state:tx/cd:37",
          districtName: "U.S. House Texas District 37",
          districtState: "TX",
          pviScore: -0.48,
          medianVoterVector: opposed,
          primaryRepVector: opposed,
          primaryDemVector: [1, 1, 1, 1, 1, 1],
          generalVector: opposed,
        },
        {
          id: "tx-10",
          slug: "tx-us-house-10-2026",
          officeName: "U.S. House Texas District 10",
          incumbentName: "Michael McCaul",
          ocdId: "ocd-division/country:us/state:tx/cd:10",
          districtName: "U.S. House Texas District 10",
          districtState: "TX",
          pviScore: 0.26,
          medianVoterVector: opposed,
          primaryRepVector: opposed,
          primaryDemVector: [1, 1, 1, 1, 1, 1],
          generalVector: opposed,
        },
        {
          id: "mi-07",
          slug: "mi-us-house-07-2026",
          officeName: "U.S. House Michigan District 7",
          incumbentName: null,
          ocdId: "ocd-division/country:us/state:mi/cd:7",
          districtName: "U.S. House Michigan District 7",
          districtState: "MI",
          pviScore: 0,
          medianVoterVector: aligned,
          primaryRepVector: aligned,
          primaryDemVector: aligned,
          generalVector: aligned,
        },
        {
          id: "tx-senate",
          slug: "tx-state-senate-14-2026",
          officeName: "Texas State Senate District 14",
          incumbentName: "Sarah Eckhardt",
          ocdId: "ocd-division/country:us/state:tx/sldu:14",
          districtName: "Texas State Senate District 14",
          districtState: "TX",
          pviScore: 0,
          medianVoterVector: aligned,
          primaryRepVector: aligned,
          primaryDemVector: aligned,
          generalVector: aligned,
        },
        {
          id: "austin-council",
          slug: "tx-austin-city-council-d9-2026",
          officeName: "Austin City Council District 9",
          incumbentName: "Zohaib Qadri",
          ocdId: "ocd-division/country:us/state:tx/place:austin/council_district:9",
          districtName: "Austin City Council District 9",
          districtState: "TX",
          pviScore: 0,
          medianVoterVector: aligned,
          primaryRepVector: aligned,
          primaryDemVector: aligned,
          generalVector: aligned,
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
          primaryRepVector: aligned,
          primaryDemVector: aligned,
          generalVector: aligned,
        },
      ],
    });

    const ids = races.map((race) => race.electionId);
    expect(ids).toContain("mi-07");
    expect(ids).toContain("tx-senate");
    expect(ids).toContain("austin-council");
    expect(ids).not.toContain("tx-10");
    expect(ids).not.toContain("tx-37");
    expect(ids).not.toContain("oakland");
    expect(ids).toHaveLength(3);
  });
});
