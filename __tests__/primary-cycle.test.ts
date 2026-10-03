import { describe, expect, it } from "vitest";
import {
  daysUntilPrimary,
  formatPrimaryDate,
  pickNominee,
  primaryClosed,
} from "@/lib/platform/cycle";

describe("primary cycle", () => {
  it("closes a frozen primary and a primary whose date has passed", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    expect(primaryClosed({ status: "frozen", primary_date: "2028-03-01T20:00:00Z" }, now)).toBe(true);
    expect(primaryClosed({ status: "active", primary_date: "2026-03-03T20:00:00Z" }, now)).toBe(true);
    expect(primaryClosed({ status: "active", primary_date: "2028-03-01T20:00:00Z" }, now)).toBe(false);
    expect(primaryClosed({ status: "active" }, now)).toBe(false);
  });

  it("counts remaining days and formats the primary calendar date", () => {
    const now = Date.parse("2026-03-01T20:00:00Z");
    expect(daysUntilPrimary("2026-03-03T20:00:00Z", now)).toBe(2);
    expect(daysUntilPrimary("2026-03-03T20:00:00Z", Date.parse("2026-03-03T20:00:00Z"))).toBe(0);
    expect(formatPrimaryDate("2026-03-03T20:00:00Z")).toBe("March 3, 2026");
    expect(formatPrimaryDate("2025-06-24T21:00:00Z")).toBe("June 24, 2025");
    expect(formatPrimaryDate("2026-08-18T20:00:00Z")).toBe("August 18, 2026");
  });

  it("crowns the highest-Elo verified debater", () => {
    const nominee = pickNominee([
      { id: "a", userId: "a", elo: 1400, debatesCount: 3, verified: false },
      { id: "b", userId: "b", elo: 1300, debatesCount: 4, verified: true },
      { id: "c", userId: "c", elo: 1500, debatesCount: 0, verified: true },
      { id: "d", userId: "d", elo: 1300, debatesCount: 2, verified: true },
    ]);
    expect(nominee?.userId).toBe("b");
  });
});
