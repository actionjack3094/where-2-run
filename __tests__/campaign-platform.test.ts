import { describe, expect, it } from "vitest";
import {
  canPublishPlatform,
  canRecruitVolunteers,
  normalizeKeyPolicies,
  normalizeManifesto,
} from "@/lib/platform/campaign";
import { volunteersToCsv } from "@/lib/platform/volunteers";

describe("volunteer export", () => {
  it("writes Name, Status, Date, and Districts and quotes commas", () => {
    const csv = volunteersToCsv([
      {
        name: "Ada Lovelace",
        status: "pending",
        date: "2026-10-03",
        districts: "Texas's 37th Congressional District; Austin, Texas",
      },
    ]);
    expect(csv.split("\r\n")[0]).toBe("Name,Status,Date,Districts");
    expect(csv).toContain("Ada Lovelace,pending,2026-10-03,");
    expect(csv).toContain('"Texas\'s 37th Congressional District; Austin, Texas"');
  });

  it("neutralizes a formula in a name", () => {
    const csv = volunteersToCsv([
      { name: "=cmd", status: "accepted", date: "2026-10-03", districts: "" },
    ]);
    expect(csv).toContain("'=cmd");
  });
});


describe("campaign platform gates", () => {
  it("lets declared candidates and frontrunners publish, and only frontrunners recruit", () => {
    expect(canPublishPlatform("pundit")).toBe(false);
    expect(canPublishPlatform("declared_candidate")).toBe(true);
    expect(canPublishPlatform("frontrunner")).toBe(true);
    expect(canRecruitVolunteers("declared_candidate")).toBe(false);
    expect(canRecruitVolunteers("frontrunner")).toBe(true);
  });

  it("keeps a manifesto and at most three policy pillars", () => {
    expect(normalizeManifesto("  A public option, a secure border, and a narrow path.  ")).toMatch(
      /public option/,
    );
    expect(normalizeKeyPolicies([" Health care ", "Border", ""])).toEqual(["Health care", "Border"]);
    expect(() => normalizeKeyPolicies(["", "  "])).toThrow(/1 and 3/);
    expect(() => normalizeKeyPolicies(["one", "two", "three", "four"])).toThrow(/1 and 3/);
  });
});
