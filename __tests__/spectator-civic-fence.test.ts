import { describe, expect, it } from "vitest";
import { CIVIC_FENCE_BALLOT_ERROR, spectatorMayVote } from "@/lib/civic-fencing";

const DISTRICT = "d1570001-0009-4000-8000-000000000009";
const OCD = "ocd-division/country:us/state:tx/place:austin/council_district:9";

describe("spectatorMayVote", () => {
  it("allows a tier-2 voter whose district matches the election", () => {
    expect(
      spectatorMayVote({
        electionDistrictId: DISTRICT,
        profileDistrictId: DISTRICT,
        verificationTier: "voter_verified",
      }),
    ).toBe(true);
  });

  it("allows a verified constituent matched by OCD division", () => {
    expect(
      spectatorMayVote({
        electionDistrictId: DISTRICT,
        profileDistrictId: null,
        electionOcdId: OCD,
        ocdIdentifiers: [OCD],
        districtVerified: true,
        verificationTier: "unverified",
      }),
    ).toBe(true);
  });

  it("rejects an out-of-district voter", () => {
    expect(
      spectatorMayVote({
        electionDistrictId: DISTRICT,
        profileDistrictId: "d1570001-0037-4000-8000-000000000037",
        electionOcdId: OCD,
        ocdIdentifiers: ["ocd-division/country:us/state:tx/cd:37"],
        verificationTier: "candidate_verified",
        districtVerified: true,
      }),
    ).toBe(false);
  });

  it("rejects an in-district voter who is not locally verified", () => {
    expect(
      spectatorMayVote({
        electionDistrictId: DISTRICT,
        profileDistrictId: DISTRICT,
        verificationTier: "phone_verified",
        districtVerified: false,
      }),
    ).toBe(false);
  });

  it("uses the spectator ballot error copy", () => {
    expect(CIVIC_FENCE_BALLOT_ERROR).toBe(
      "Civic Fencing Active: You must be a verified constituent of this district to cast a ballot.",
    );
  });
});
