import { describe, expect, it } from "vitest";
import { matchedPrimaryIds, openChallengeInScope } from "@/lib/debates/matched-primaries";
import type { DirectoryPrimary } from "@/lib/elections/state-directory";

function seat(id: string, party: "democrat" | "republican"): DirectoryPrimary {
  return {
    id,
    party,
    officeName: "U.S. House",
    state: "TX",
    district: "10",
    slug: id,
    generalSlug: "tx-10",
    baselineX: party === "democrat" ? -0.4 : 0.4,
    baselineY: 0.1,
    status: "active",
    level: "federal",
    cycleYear: 2026,
    ocdId: "ocd-division/country:us/state:tx/cd:10",
  };
}

describe("matched primary ids", () => {
  const primaries = [seat("dem", "democrat"), seat("rep", "republican")];

  it("keeps the Democratic primary for a Democratic vector", () => {
    const ids = matchedPrimaryIds(primaries, { x: -0.5, y: 0.1 });
    expect(ids.has("dem")).toBe(true);
    expect(ids.has("rep")).toBe(false);
  });

  it("keeps the Republican primary for a Republican vector", () => {
    const ids = matchedPrimaryIds(primaries, { x: 0.5, y: 0.1 });
    expect(ids.has("rep")).toBe(true);
    expect(ids.has("dem")).toBe(false);
  });

  it("drops a seat that has no primary in the viewer's party", () => {
    const ids = matchedPrimaryIds([seat("rep", "republican")], { x: -0.6, y: 0 });
    expect(ids.size).toBe(0);
  });
});

describe("open challenge scope", () => {
  const scope = { ids: new Set(["dem"]), party: "democrat" as const };

  it("keeps a challenge in a matched Democratic primary", () => {
    expect(openChallengeInScope({ primaryId: "dem", party: "Democratic" }, scope)).toBe(true);
  });

  it("drops the opposing party even when the seat id is present", () => {
    expect(openChallengeInScope({ primaryId: "dem", party: "Republican" }, scope)).toBe(false);
  });

  it("drops a primary outside the matched set", () => {
    expect(openChallengeInScope({ primaryId: "other", party: "democrat" }, scope)).toBe(false);
  });
});
