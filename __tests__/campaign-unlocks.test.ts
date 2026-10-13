import { describe, expect, it } from "vitest";
import {
  campaignUnlocks,
  exploringOfficeLabel,
  IN_DISTRICT_VOTE_GOAL,
  parseStatutoryFilingFee,
} from "@/lib/campaign/unlocks";

const TX10 = "ocd-division/country:us/state:tx/cd:10";

describe("parseStatutoryFilingFee", () => {
  it("reads the dollar amount from a statutory filing-fee sentence", () => {
    expect(parseStatutoryFilingFee("$3,125 statutory filing fee, or a nominating petition in lieu")).toBe(3125);
    expect(parseStatutoryFilingFee({ filing_fee: "$1,250 statutory filing fee, or a petition in lieu" })).toBe(1250);
  });

  it("ignores fees that are not a positive dollar amount", () => {
    expect(parseStatutoryFilingFee("Filing fee set by ordinance, or a nominating petition in lieu")).toBeNull();
    expect(parseStatutoryFilingFee("$0 application; petition in lieu if required")).toBeNull();
    expect(parseStatutoryFilingFee(null)).toBeNull();
  });
});

describe("exploringOfficeLabel", () => {
  it("formats a House seat as office and district", () => {
    expect(
      exploringOfficeLabel({
        officeName: "U.S. House Texas District 10",
        state: "TX",
        district: "10",
        ocdId: TX10,
      }),
    ).toBe("U.S. House · TX-10");
  });

  it("keeps a statewide office on the state", () => {
    expect(
      exploringOfficeLabel({
        officeName: "U.S. Senate",
        state: "tx",
        ocdId: "ocd-division/country:us/state:tx",
      }),
    ).toBe("U.S. Senate · TX");
  });
});

describe("campaignUnlocks", () => {
  const exploring = {
    officeLabel: "U.S. House · TX-10",
    inDistrictVotes: 0,
    pledged: 0,
    filingFee: 3125,
    filed: false,
  };

  it("opens the district floor and locks the later stages", () => {
    const view = campaignUnlocks(exploring);
    expect(view.header).toBe("Exploring Campaign: U.S. House · TX-10");
    expect(view.filingFeeLabel).toBe("$3,125");
    expect(view.rank).toBe("PROSPECTIVE");
    expect(view.stages.map((stage) => stage.locked)).toEqual([false, true, true]);
    expect(view.stages[0].statusLabel).toBe("Active · Complete");
    expect(view.stages[1].lockCopy).toBe(
      `Earn ${IN_DISTRICT_VOTE_GOAL} more in-district votes to unlock My Ballot priority`,
    );
    expect(view.stages[2].lockCopy).toBe("Raise $3,125 more to unlock escrow filing fee distribution.");
    expect(view.stages[2].progress?.label).toBe("$0 / $3,125 Raised");
  });

  it("counts the remaining in-district votes and escrow dollars", () => {
    const view = campaignUnlocks({ ...exploring, inDistrictVotes: 37, pledged: 900 });
    expect(view.stages[1].progress?.label).toBe("37 / 50");
    expect(view.stages[1].lockCopy).toBe("Earn 13 more in-district votes to unlock My Ballot priority");
    expect(view.stages[2].progress?.label).toBe("$900 / $3,125 Raised");
    expect(view.stages[2].lockCopy).toBe("Raise $2,225 more to unlock escrow filing fee distribution.");
    expect(view.rank).toBe("PROSPECTIVE");
  });

  it("promotes a prospect once fifty verified in-district votes are in", () => {
    const view = campaignUnlocks({ ...exploring, inDistrictVotes: 50 });
    expect(view.rank).toBe("CONTENDER");
    expect(view.stages[1].locked).toBe(false);
    expect(view.stages[1].lockCopy).toBeNull();
    expect(view.stages[1].statusLabel).toBe("Unlocked");
  });

  it("opens escrow disbursement at the statutory fee and badges a filed candidate", () => {
    const view = campaignUnlocks({ ...exploring, pledged: 3125, filed: true });
    expect(view.filed).toBe(true);
    expect(view.stages[2].locked).toBe(false);
    expect(view.stages[2].lockCopy).toBeNull();
    expect(view.stages[2].badge).toBe("ON THE BALLOT");
  });

  it("keeps the financial lock closed when the filing fee is unpublished", () => {
    const view = campaignUnlocks({ ...exploring, filingFee: null, pledged: 900 });
    expect(view.filingFeeLabel).toBeNull();
    expect(view.stages[2].locked).toBe(true);
    expect(view.stages[2].lockCopy).toBe("The statutory filing fee for this office is not on file yet.");
    expect(view.stages[2].progress?.label).toBe("$900 raised");
  });
});
