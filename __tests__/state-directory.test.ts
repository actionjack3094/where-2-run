import { describe, expect, it } from "vitest";
import {
  closestRaces,
  countByTier,
  groupGeneralRaces,
  isMacroStatewideOffice,
  primaryOfficeName,
  type DirectoryPrimary,
} from "@/lib/elections/state-directory";

function primary(overrides: Partial<DirectoryPrimary> & Pick<DirectoryPrimary, "id" | "officeName" | "generalSlug" | "slug">): DirectoryPrimary {
  return {
    party: "democrat",
    state: "TX",
    district: null,
    baselineX: 0,
    baselineY: 0,
    status: "active",
    level: "federal",
    cycleYear: 2026,
    ...overrides,
  };
}

describe("statewide offices", () => {
  it("keeps Governor and U.S. Senate and leaves district seats out", () => {
    expect(isMacroStatewideOffice("U.S. Senate")).toBe(true);
    expect(isMacroStatewideOffice("US Senate")).toBe(true);
    expect(isMacroStatewideOffice("United States Senate")).toBe(true);
    expect(isMacroStatewideOffice("Governor")).toBe(true);
    expect(isMacroStatewideOffice("Lieutenant Governor")).toBe(false);
    expect(isMacroStatewideOffice("Texas State Senate")).toBe(false);
    expect(isMacroStatewideOffice("U.S. House")).toBe(false);
    expect(isMacroStatewideOffice("Austin Mayor")).toBe(false);
    expect(primaryOfficeName("U.S. House", "US Senate")).toBe("U.S. House");
  });
});

describe("state directory races", () => {
  const rows = [
    primary({
      id: "sen-dem",
      officeName: "U.S. Senate",
      generalSlug: "tx-senate",
      slug: "tx-senate-dem",
      baselineX: -0.34,
      baselineY: 0.12,
    }),
    primary({
      id: "sen-rep",
      party: "republican",
      officeName: "U.S. Senate",
      generalSlug: "tx-senate",
      slug: "tx-senate-rep",
      baselineX: 0.3,
      baselineY: 0.18,
    }),
    primary({
      id: "sen-dem-old",
      officeName: "U.S. Senate",
      generalSlug: "tx-senate",
      slug: "tx-senate-2024-dem",
      cycleYear: 2024,
      baselineX: -0.1,
      baselineY: 0,
    }),
    primary({
      id: "house-dem",
      officeName: "U.S. House",
      generalSlug: "tx-10",
      slug: "tx-10-dem",
      district: "10",
      baselineX: -0.9,
      baselineY: -0.8,
    }),
    primary({
      id: "gov-dem",
      officeName: "Governor",
      generalSlug: "tx-gov",
      slug: "tx-gov-dem",
      level: "state",
      baselineX: -0.2,
      baselineY: 0.1,
    }),
    primary({
      id: "mayor",
      officeName: "Austin Mayor",
      generalSlug: "austin-mayor",
      slug: "austin-mayor-dem",
      level: "federal",
      baselineX: -0.4,
      baselineY: -0.2,
    }),
    primary({
      id: "frozen",
      officeName: "U.S. House",
      generalSlug: "tx-37",
      slug: "tx-37-dem",
      district: "37",
      status: "frozen",
    }),
  ];

  it("counts active general elections by tier and treats a mayor as local", () => {
    const races = groupGeneralRaces(rows);
    expect(races).toHaveLength(5);
    expect(countByTier(races)).toEqual({ federal: 2, state: 1, local: 1 });
    expect(races.find((race) => race.generalSlug === "tx-senate")?.lanes.map((lane) => lane.party)).toEqual([
      "democrat",
      "republican",
    ]);
  });

  it("ranks races by distance to the viewer's party baseline", () => {
    const ranked = closestRaces(groupGeneralRaces(rows), { x: -0.34, y: 0.12 });
    expect(ranked.map((race) => race.generalSlug)).toEqual(["tx-senate", "tx-gov", "austin-mayor", "tx-10"]);
    expect(ranked[0]?.distance).toBe(0);
    expect(ranked.some((race) => race.generalSlug === "tx-37")).toBe(false);
  });
});
