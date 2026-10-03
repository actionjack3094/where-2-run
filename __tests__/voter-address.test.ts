import { describe, expect, it } from "vitest";
import { ocdMatches } from "@/lib/platform/records";
import {
  districtsFromCensusGeographies,
  districtsFromOcdIds,
} from "@/lib/civic/voter-districts";

describe("voter address districts", () => {
  it("turns a Census geography match into overlapping OCD-IDs", () => {
    const districts = districtsFromCensusGeographies({
      States: [{ STUSAB: "TX", STATE: "48" }],
      Counties: [{ BASENAME: "Travis" }],
      "119th Congressional Districts": [{ BASENAME: "37", STATE: "48" }],
      "State Legislative Districts - Upper": [{ BASENAME: "014" }],
      "State Legislative Districts - Lower": [{ BASENAME: "49" }],
      "Incorporated Places": [{ BASENAME: "Austin" }],
    });

    expect(districts.stateCode).toBe("TX");
    expect(districts.congressionalDistrict).toBe("37");
    expect(districts.stateLegDistrictUpper).toBe("14");
    expect(districts.stateLegDistrictLower).toBe("49");
    expect(districts.county).toBe("Travis");
    expect(districts.municipality).toBe("Austin");
    expect(districts.ocdIds).toEqual([
      "ocd-division/country:us/state:tx",
      "ocd-division/country:us/state:tx/cd:37",
      "ocd-division/country:us/state:tx/county:travis",
      "ocd-division/country:us/state:tx/place:austin",
      "ocd-division/country:us/state:tx/sldl:49",
      "ocd-division/country:us/state:tx/sldu:14",
    ]);
    expect(districts.congressional).toMatch(/Congressional/i);
    expect(districts.stateHouse).toMatch(/State House/i);
    expect(districts.cityCouncil).toBe("Austin · citywide");
  });

  it("keeps a city council division from a Civic divisions list", () => {
    const districts = districtsFromOcdIds([
      "ocd-division/country:us",
      "ocd-division/country:us/state:tx/cd:37",
      "ocd-division/country:us/state:tx/sldl:49",
      "ocd-division/country:us/state:tx/place:austin/council_district:9",
    ]);
    expect(districts.ocdIds).not.toContain("ocd-division/country:us");
    expect(districts.cityCouncil).toMatch(/Council District/i);
    expect(districts.municipality).toBe("Austin");
  });

  it("matches every primary whose OCD-ID is on the voter list", () => {
    const home = [
      "ocd-division/country:us/state:tx/cd:37",
      "ocd-division/country:us/state:tx/sldl:49",
      "ocd-division/country:us/state:tx/place:austin",
    ];
    expect(ocdMatches(home, "ocd-division/country:us/state:tx/cd:37")).toBe(true);
    expect(ocdMatches(home, "ocd-division/country:us/state:tx/place:austin")).toBe(true);
    expect(ocdMatches(home, "ocd-division/country:us/state:tx/cd:10")).toBe(false);
  });
});
