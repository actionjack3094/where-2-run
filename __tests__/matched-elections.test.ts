import { describe, expect, it } from "vitest";
import {
  alignmentPercent,
  filterMatchedRaces,
  inBackyard,
  matchedOfficeLabel,
  rankMatchedRaces,
  type MatchedRace,
} from "@/lib/elections/matched";
import type { DirectoryLane } from "@/lib/elections/state-directory";

const HOME = [
  "ocd-division/country:us/state:tx/cd:10",
  "ocd-division/country:us/state:tx/place:austin",
];

function lane(party: "democrat" | "republican", x: number, y: number): DirectoryLane {
  return { id: party, party, slug: `${party}-slug`, baselineX: x, baselineY: y };
}

function race(overrides: Partial<MatchedRace> & Pick<MatchedRace, "generalSlug" | "officeName" | "ocdId">): MatchedRace {
  return {
    state: "TX",
    district: null,
    tier: "federal",
    active: true,
    lanes: [lane("democrat", -0.2, 0), lane("republican", 0.4, 0.2)],
    incumbentName: null,
    ...overrides,
  };
}

const field: MatchedRace[] = [
  race({
    generalSlug: "tx-10",
    officeName: "U.S. House",
    district: "10",
    ocdId: "ocd-division/country:us/state:tx/cd:10",
    incumbentName: "Michael McCaul",
    lanes: [lane("democrat", -0.2, 0)],
  }),
  race({
    generalSlug: "tx-senate",
    officeName: "U.S. Senate",
    ocdId: "ocd-division/country:us/state:tx",
    lanes: [lane("democrat", 0, 0)],
  }),
  race({
    generalSlug: "tx-gov",
    officeName: "Governor",
    tier: "state",
    ocdId: "ocd-division/country:us/state:tx",
  }),
  race({
    generalSlug: "austin-9",
    officeName: "Austin City Council",
    district: "9",
    tier: "local",
    ocdId: "ocd-division/country:us/state:tx/place:austin/council_district:9",
  }),
  race({
    generalSlug: "tx-37",
    officeName: "U.S. House",
    district: "37",
    ocdId: "ocd-division/country:us/state:tx/cd:37",
    incumbentName: "Lloyd Doggett",
  }),
  race({
    generalSlug: "dallas-1",
    officeName: "Dallas City Council",
    district: "1",
    tier: "local",
    ocdId: "ocd-division/country:us/state:tx/place:dallas/council_district:1",
  }),
  race({
    generalSlug: "fl-senate",
    officeName: "U.S. Senate",
    state: "FL",
    ocdId: "ocd-division/country:us/state:fl",
  }),
];

describe("matched election labels", () => {
  it("formats house and council seats and turns a perfect overlap into 100%", () => {
    expect(matchedOfficeLabel(field[0])).toBe("U.S. House · TX-10");
    expect(matchedOfficeLabel(field[3])).toBe("Austin City Council · District 9");
    expect(alignmentPercent(0)).toBe(100);
    expect(alignmentPercent(Math.sqrt(8))).toBe(0);
  });
});

describe("matched election filters", () => {
  const home = { ocdIds: HOME, state: "TX" };

  it("keeps My Backyard on the home district and municipal races", () => {
    const slugs = filterMatchedRaces(field, { scope: "backyard", level: "all", viability: "all" }, home).map(
      (race) => race.generalSlug,
    );
    expect(slugs).toEqual(["tx-10", "austin-9"]);
    expect(inBackyard(field[1], HOME)).toBe(false);
  });

  it("expands In-State to statewide and legislative seats and leaves other cities out", () => {
    const slugs = filterMatchedRaces(field, { scope: "state", level: "all", viability: "all" }, home).map(
      (race) => race.generalSlug,
    );
    expect(slugs).toEqual(["tx-10", "tx-senate", "tx-gov", "austin-9", "tx-37"]);
  });

  it("applies office level and open-seat filters, then ranks by alignment", () => {
    const openFederal = filterMatchedRaces(field, { scope: "nationwide", level: "federal", viability: "open" }, home);
    expect(openFederal.map((race) => race.generalSlug)).toEqual(["tx-senate", "fl-senate"]);
    const ranked = rankMatchedRaces(openFederal, { x: 0, y: 0 });
    expect(ranked[0]?.generalSlug).toBe("tx-senate");
    expect(ranked[0]?.alignment).toBe(100);
  });
});
