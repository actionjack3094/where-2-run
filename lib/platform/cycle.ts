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
