export type PrimaryCycle = {
  status?: string | null;
  primary_date?: string | null;
};

const DAY_MS = 86_400_000;

/** A primary is closed once it is marked frozen or its primary date has passed. */
export function primaryClosed(primary: PrimaryCycle, now = Date.now()) {
  if (primary.status === "frozen") return true;
  if (!primary.primary_date) return false;
  const deadline = Date.parse(primary.primary_date);
  return Number.isFinite(deadline) && deadline <= now;
}

/** Whole days left until the primary date, rounded up so the last partial day still counts. */
export function daysUntilPrimary(primaryDate: string, now = Date.now()) {
  const deadline = Date.parse(primaryDate);
  if (!Number.isFinite(deadline) || deadline <= now) return 0;
  return Math.ceil((deadline - now) / DAY_MS);
}

export function formatPrimaryDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

export type NomineeCandidate = {
  id: string;
  userId: string;
  elo: number;
  debatesCount: number;
  verified: boolean;
};

export const FILING_LEAD_MS = 90 * DAY_MS;

export type CycleSource = {
  slug: string;
  cycle_year: number;
  primary_date: string;
  general_election_date?: string | null;
  term_length_years?: number | null;
  status?: string | null;
};

export function shiftIsoYears(iso: string, years: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const next = new Date(date.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next.toISOString();
}

/** Filing closes 90 days before the primary date of the open cycle. */
export function filingDeadlineFromPrimary(primaryDate: string) {
  const date = new Date(primaryDate);
  if (Number.isNaN(date.getTime())) return primaryDate;
  return new Date(date.getTime() - FILING_LEAD_MS).toISOString();
}

/**
 * Walk a closed primary forward by its term until the next cycle is still open.
 * A two-year House term that ended in 2026 lands on 2028.
 */
export function openSuccessor<T extends CycleSource>(primary: T, now = Date.now()): T {
  let current = primary;
  for (let step = 0; step < 16 && primaryClosed(current, now); step += 1) {
    const term =
      current.term_length_years && current.term_length_years > 0 ? current.term_length_years : 2;
    current = {
      ...current,
      cycle_year: (current.cycle_year || 0) + term,
      primary_date: shiftIsoYears(current.primary_date, term),
      general_election_date: current.general_election_date
        ? shiftIsoYears(current.general_election_date, term)
        : null,
      status: "active",
    };
  }
  return current;
}

/** One open successor per slug whose latest cycle has already concluded. */
export function planPrimaryRollovers<T extends CycleSource>(rows: T[], now = Date.now()): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.slug) ?? [];
    list.push(row);
    groups.set(row.slug, list);
  }

  const drafts: T[] = [];
  for (const list of groups.values()) {
    const latest = [...list].sort((a, b) => (b.cycle_year ?? 0) - (a.cycle_year ?? 0))[0];
    if (!latest || !primaryClosed(latest, now)) continue;
    if (!Number.isFinite(Date.parse(latest.primary_date))) continue;
    const next = openSuccessor(latest, now);
    if (next.cycle_year === latest.cycle_year) continue;
    if (list.some((row) => row.cycle_year === next.cycle_year)) continue;
    drafts.push(next);
  }
  return drafts;
}

export type FilingClock = {
  cycleYear: number;
  deadline: string;
  primaryDate: string;
};

/** Soonest future filing deadline among primaries that are still open. */
export function nextFilingClock(rows: CycleSource[], now = Date.now()): FilingClock | null {
  const upcoming = rows
    .filter((row) => row.primary_date && !primaryClosed(row, now))
    .map((row) => ({
      cycleYear: row.cycle_year,
      primaryDate: row.primary_date,
      deadline: filingDeadlineFromPrimary(row.primary_date),
    }))
    .filter((row) => Date.parse(row.deadline) > now)
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline) || a.cycleYear - b.cycleYear);
  return upcoming[0] ?? null;
}

export function preferCurrentPrimary<T extends PrimaryCycle & { slug: string; cycle_year?: number }>(
  rows: T[],
  slug: string,
  now = Date.now(),
) {
  const matches = rows.filter((row) => row.slug === slug);
  if (matches.length === 0) return null;
  const open = matches.filter((row) => !primaryClosed(row, now));
  const pool = open.length > 0 ? open : matches;
  return [...pool].sort((a, b) => (b.cycle_year ?? 0) - (a.cycle_year ?? 0))[0];
}

/** Highest Elo among verified debaters who have finished at least one match. */
export function pickNominee(rows: NomineeCandidate[]) {
  const eligible = rows.filter((row) => row.verified && row.debatesCount > 0);
  eligible.sort(
    (a, b) => b.elo - a.elo || b.debatesCount - a.debatesCount || a.userId.localeCompare(b.userId),
  );
  return eligible[0] ?? null;
}
