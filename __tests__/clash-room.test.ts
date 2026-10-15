import { describe, expect, it } from "vitest";
import {
  canFileRebuttal,
  clashClock,
  fileRebuttal,
  floorStatus,
  inDistrict,
  primaryDistrictBadge,
  rebuttalFor,
  resolveClashWindow,
  zipCoversDistrict,
} from "@/lib/debates/clash-room";

const NOW = Date.parse("2026-10-15T18:00:00.000Z");

describe("two-stage clash window", () => {
  it("keeps the rebuttal window open until the deadline", () => {
    expect(
      resolveClashWindow({
        clashStage: "rebuttal",
        rebuttalExpiresAt: "2026-10-16T18:00:00.000Z",
        now: NOW,
      }),
    ).toBe("rebuttal");
    expect(
      resolveClashWindow({
        clashStage: "2_rebuttal_window",
        rebuttalExpiresAt: "2026-10-16T18:00:00.000Z",
        now: NOW,
      }),
    ).toBe("rebuttal");
  });

  it("locks when the stage is closed or the window has expired", () => {
    expect(resolveClashWindow({ clashStage: "closed", now: NOW })).toBe("locked");
    expect(resolveClashWindow({ clashStage: "3_locked", now: NOW })).toBe("locked");
    expect(
      resolveClashWindow({
        clashStage: "rebuttal",
        rebuttalExpiresAt: "2026-10-15T17:59:00.000Z",
        now: NOW,
      }),
    ).toBe("locked");
  });

  it("formats the live clock and the district badge", () => {
    expect(clashClock("2026-10-17T18:00:00.000Z", NOW)).toEqual({
      label: "48:00:00",
      expired: false,
    });
    expect(clashClock("2026-10-15T17:00:00.000Z", NOW).expired).toBe(true);
    expect(
      primaryDistrictBadge({
        officeName: "U.S. House",
        state: "TX",
        district: "10",
        ocdId: "ocd-division/country:us/state:tx/cd:10",
      }),
    ).toBe("U.S. House · TX-10 Primary");
  });

  it("stores one rebuttal per candidate and gates the composer", () => {
    const filed = fileRebuttal([{ round: 2, author_id: "a", content: "First reply." }], {
      round: 2,
      author_id: "b",
      content: "Second reply.",
    });
    expect(rebuttalFor(filed, "a")).toBe("First reply.");
    expect(rebuttalFor(filed, "b")).toBe("Second reply.");
    expect(
      canFileRebuttal({ window: "rebuttal", viewerId: "a", candidateId: "a", rebuttal: null }),
    ).toBe(true);
    expect(
      canFileRebuttal({
        window: "rebuttal",
        viewerId: "spectator",
        candidateId: "a",
        rebuttal: null,
      }),
    ).toBe(false);
    expect(
      canFileRebuttal({ window: "locked", viewerId: "a", candidateId: "a", rebuttal: null }),
    ).toBe(false);
  });

  it("marks contenders from in-district votes and ballot status from a filing", () => {
    expect(floorStatus({ inDistrictVotes: 49, filed: false })).toBe("PROSPECTIVE");
    expect(floorStatus({ inDistrictVotes: 50, filed: false })).toBe("CONTENDER");
    expect(floorStatus({ inDistrictVotes: 12, filed: true })).toBe("ON THE BALLOT");
  });

  it("matches a verified ZIP or home division to the primary", () => {
    expect(zipCoversDistrict("78701", ["78701-1234"])).toBe(true);
    expect(
      inDistrict({
        verified: true,
        votingZip: "78701",
        districtZips: ["78701"],
        homeOcdIds: [],
        primaryOcdId: "ocd-division/country:us/state:tx/cd:10",
      }),
    ).toBe(true);
    expect(
      inDistrict({
        verified: true,
        votingZip: "10001",
        districtZips: ["78701"],
        homeOcdIds: ["ocd-division/country:us/state:tx/cd:10"],
        primaryOcdId: "ocd-division/country:us/state:tx/cd:10",
      }),
    ).toBe(true);
    expect(
      inDistrict({
        verified: false,
        votingZip: "78701",
        districtZips: ["78701"],
        homeOcdIds: [],
        primaryOcdId: "ocd-division/country:us/state:tx/cd:10",
      }),
    ).toBe(false);
  });
});
