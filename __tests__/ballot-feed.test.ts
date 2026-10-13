import { describe, expect, it } from "vitest";
import { districtLabelFromOcd, formatDistrictLabel } from "@/lib/ballot/district-label";
import { isOfficiallyFiled } from "@/lib/ballot/filing";

describe("ballot district labels", () => {
  it("formats a state and district number as TX-10", () => {
    expect(formatDistrictLabel("tx", "10")).toBe("TX-10");
    expect(formatDistrictLabel("TX", "TX-10")).toBe("TX-10");
    expect(districtLabelFromOcd(["ocd-division/country:us/state:tx/cd:10"])).toBe("TX-10");
  });
});

describe("ballot standing", () => {
  it("marks a filed or certified campaign as on the ballot", () => {
    expect(isOfficiallyFiled({ status: "filed" })).toBe(true);
    expect(isOfficiallyFiled({ officialCandidateId: "H0TX00123" })).toBe(true);
    expect(isOfficiallyFiled({ isNominee: true })).toBe(true);
    expect(isOfficiallyFiled({ status: "exploring" })).toBe(false);
  });
});
