import { describe, expect, it } from "vitest";
import { cleanReportReason, isPlatformAdmin, reportedStance } from "@/lib/platform/moderation";

const debate = {
  candidate_a_id: "aaaa",
  candidate_b_id: "bbbb",
  stance_a: "Opening.",
  stance_b: "Rebuttal.",
};

describe("civic moderation", () => {
  it("treats an admin flag or an allowlisted email as a moderator", () => {
    expect(isPlatformAdmin("person@example.com", true, [])).toBe(true);
    expect(isPlatformAdmin(" Admin@Where2Run.app ", false, ["admin@where2run.app"])).toBe(true);
    expect(isPlatformAdmin("person@example.com", false, ["admin@where2run.app"])).toBe(false);
    expect(isPlatformAdmin(null, false, ["admin@where2run.app"])).toBe(false);
  });

  it("keeps the offender's own stance for the review queue", () => {
    expect(reportedStance(debate, "aaaa")).toBe("Opening.");
    expect(reportedStance(debate, "bbbb")).toBe("Rebuttal.");
    expect(reportedStance({ ...debate, candidate_b_id: null, stance_b: null }, "bbbb")).toBeNull();
  });

  it("rejects a reason that is too short", () => {
    expect(cleanReportReason("  spam  ")).toBe("spam");
    expect(cleanReportReason("no")).toBeNull();
  });
});
