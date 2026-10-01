import { normalizeOcdId } from "@/lib/civic-fencing";

export const RESIDENCY_DISCLAIMER =
  "This is a statutory estimate. You must independently verify all residency and filing deadlines with the State Secretary of State before relocating or vaulting funds.";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const CONGRESSIONAL_OCD = /\/state:([a-z]{2})\/cd:(\d+)\b/;

/** Compact House label, e.g. `ocd-division/.../state:tx/cd:37` → `U.S. House TX-37`. */
export function compactCongressionalLabel(ocdId: string | null | undefined): string | null {
  const match = CONGRESSIONAL_OCD.exec(normalizeOcdId(ocdId));
  if (!match) return null;
  return `U.S. House ${match[1].toUpperCase()}-${match[2]}`;
}

/** Picker copy such as `2026 U.S. House TX-37`. */
export function formatCandidacyLabel(
  officeName: string,
  ocdId: string | null | undefined,
  electionDate: string | null | undefined,
): string {
  const year = ISO_DATE.exec(electionDate ?? "")?.[1];
  const body = compactCongressionalLabel(ocdId) ?? (officeName.trim() || "Upcoming race");
  return year ? `${year} ${body}` : body;
}

export function isUpcomingElectionDate(electionDate: string | null | undefined, today = new Date()) {
  if (!electionDate) return true;
  const match = ISO_DATE.exec(electionDate);
  if (!match) return true;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const todayIso = today.toISOString().slice(0, 10);
  return iso >= todayIso;
}

/** Election day minus the statutory residency window, as YYYY-MM-DD in UTC. */
export function relocationDeadlineIso(
  electionDate: string | null | undefined,
  residencyRequirementDays: number | null | undefined,
): string | null {
  if (electionDate == null || residencyRequirementDays == null) return null;
  if (!Number.isInteger(residencyRequirementDays) || residencyRequirementDays < 0) {
    return null;
  }

  const match = ISO_DATE.exec(electionDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() - residencyRequirementDays);
  return date.toISOString().slice(0, 10);
}

export function formatStatutoryDate(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))),
  );
}
