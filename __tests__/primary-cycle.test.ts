import { describe, expect, it } from "vitest";
import {
  daysUntilPrimary,
  filingDeadlineFromPrimary,
  formatPrimaryDate,
  nextFilingClock,
  pickNominee,
  planPrimaryRollovers,
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

  it("rolls a concluded primary into the next open cycle and clocks the filing deadline", () => {
    const now = Date.parse("2026-10-06T15:00:00Z");
    const closed = {
      slug: "tx-house-02-dem",
      cycle_year: 2026,
      primary_date: "2026-03-03T20:00:00.000Z",
      general_election_date: "2026-11-03T00:00:00.000Z",
      term_length_years: 2,
      status: "frozen" as const,
    };

    const [next] = planPrimaryRollovers([closed], now);
    expect(next?.cycle_year).toBe(2028);
    expect(next?.status).toBe("active");
    expect(new Date(next!.primary_date).getUTCFullYear()).toBe(2028);
    expect(Date.parse(next!.primary_date) - Date.parse(filingDeadlineFromPrimary(next!.primary_date))).toBe(
      90 * 86_400_000,
    );
    expect(nextFilingClock([next!], now)?.cycleYear).toBe(2028);
    expect(planPrimaryRollovers([closed, next!], now)).toEqual([]);
  });

  it("keeps walking closed cycles until the next primary date is still ahead", () => {
    const now = Date.parse("2026-10-06T15:00:00Z");
    const [next] = planPrimaryRollovers(
      [
        {
          slug: "tx-house-02-dem",
          cycle_year: 2022,
          primary_date: "2022-03-03T20:00:00.000Z",
          term_length_years: 2,
          status: "frozen",
        },
      ],
      now,
    );
    expect(next?.cycle_year).toBe(2028);

    const [senate] = planPrimaryRollovers(
      [
        {
          slug: "tx-senate-dem",
          cycle_year: 2026,
          primary_date: "2026-03-03T20:00:00.000Z",
          term_length_years: 6,
          status: "active",
        },
      ],
      now,
    );
    expect(senate?.cycle_year).toBe(2032);
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
