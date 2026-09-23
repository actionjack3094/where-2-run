import { describe, expect, it } from "vitest";
import {
  formatStatutoryDate,
  relocationDeadlineIso,
  RESIDENCY_DISCLAIMER,
} from "@/lib/campaign/targets";

describe("relocationDeadlineIso", () => {
  it("subtracts the residency window from election day", () => {
    expect(relocationDeadlineIso("2026-11-03", 365)).toBe("2025-11-03");
    expect(relocationDeadlineIso("2026-11-03T00:00:00Z", 0)).toBe("2026-11-03");
  });

  it("crosses a leap day", () => {
    expect(relocationDeadlineIso("2024-03-01", 1)).toBe("2024-02-29");
  });

  it("returns null when the calendar is incomplete", () => {
    expect(relocationDeadlineIso(null, 180)).toBeNull();
    expect(relocationDeadlineIso("2026-11-03", null)).toBeNull();
    expect(relocationDeadlineIso("2026-02-31", 1)).toBeNull();
    expect(relocationDeadlineIso("2026-11-03", -1)).toBeNull();
  });
});

describe("formatStatutoryDate", () => {
  it("prints a UTC calendar date", () => {
    expect(formatStatutoryDate("2025-11-03")).toBe("November 3, 2025");
  });
});

describe("RESIDENCY_DISCLAIMER", () => {
  it("tells the candidate to verify the deadline independently", () => {
    expect(RESIDENCY_DISCLAIMER).toBe(
      "This is a statutory estimate. You must independently verify all residency and filing deadlines with the State Secretary of State before relocating or vaulting funds.",
    );
  });
});
