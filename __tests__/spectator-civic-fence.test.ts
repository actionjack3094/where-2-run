import { describe, expect, it } from "vitest";
import { CIVIC_FENCE_BALLOT_ERROR, spectatorMayVote } from "@/lib/civic-fencing";

const DISTRICT = "d1570001-0009-4000-8000-000000000009";
const OCD = "ocd-division/country:us/state:tx/place:austin/council_district:9";

describe("spectatorMayVote", () => {
  it("allows a spectator whose physical district matches the election", () => {
    expect(
      spectatorMayVote({
        electionDistrictId: DISTRICT,
        profileDistrictId: DISTRICT,
      }),
    ).toBe(true);
  });

  it("allows a spectator whose home OCD matches the election", () => {
    expect(
      spectatorMayVote({
        electionDistrictId: DISTRICT,
        profileDistrictId: null,
        electionOcdId: OCD,
        homeOcdIds: [OCD],
      }),
    ).toBe(true);
  });

  it("rejects an out-of-district spectator", () => {
    expect(
      spectatorMayVote({
        electionDistrictId: DISTRICT,
        profileDistrictId: "d1570001-0037-4000-8000-000000000037",
        electionOcdId: OCD,
        ocdIdentifiers: ["ocd-division/country:us/state:tx/cd:37"],
        homeOcdIds: ["ocd-division/country:us/state:tx/cd:37"],
      }),
    ).toBe(false);
  });

  it("does not require Tier 2 jury verification to vote in-district", () => {
    expect(
      spectatorMayVote({
        electionDistrictId: DISTRICT,
        profileDistrictId: DISTRICT,
        verificationTier: "phone_verified",
        districtVerified: false,
      }),
    ).toBe(true);
  });

  it("uses the spectator ballot error copy", () => {
    expect(CIVIC_FENCE_BALLOT_ERROR).toMatch(/physical ballot/i);
  });
});
