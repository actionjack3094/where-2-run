import { exploringOfficeLabel, IN_DISTRICT_VOTE_GOAL } from "@/lib/campaign/unlocks";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { normalizeZip } from "@/lib/electability";
import { alignmentPercent } from "@/lib/elections/matched";
import { euclidean, type AxisPoint } from "@/lib/platform/scoring";

/** Round 2 rebuttal length. Openings stay at 1,000 characters. */
export const REBUTTAL_CHAR_LIMIT = 500;

export type ClashWindow = "opening" | "rebuttal" | "locked";

export type FloorStatus = "PROSPECTIVE" | "CONTENDER" | "ON THE BALLOT";

export type TranscriptEntry = {
  round: number;
  author_id: string;
  content: string;
};

/**
 * Two-stage window.
 * Stored stages are `opening`, `rebuttal`, and `closed`.
 * `2_rebuttal_window` and `3_locked` are accepted so a row can use either name.
 * A past `rebuttal_expires_at` locks the transcript even if the stage column still says rebuttal.
 */
export function resolveClashWindow(input: {
  clashStage?: string | null;
  rebuttalExpiresAt?: string | null;
  now?: number;
}): ClashWindow {
  const now = input.now ?? Date.now();
  const stage = (input.clashStage ?? "").trim();
  const expires = input.rebuttalExpiresAt ? Date.parse(input.rebuttalExpiresAt) : Number.NaN;
  const expired = Number.isFinite(expires) && expires <= now;
  if (expired || stage === "closed" || stage === "3_locked") return "locked";
  if (stage === "rebuttal" || stage === "2_rebuttal_window") return "rebuttal";
  return "opening";
}

/** Header clock. Hours accumulate, so a 48-hour window reads `48:00:00`. */
export function clashClock(expiresAt: string | null | undefined, now: number) {
  const expires = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const remainingMs = expires - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return { label: "EXPIRED", expired: true };
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return { label: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`, expired: false };
}

/** District chip such as `U.S. House · TX-10 Primary`. */
export function primaryDistrictBadge(input: {
  officeName: string;
  state?: string | null;
  district?: string | null;
  ocdId?: string | null;
}) {
  const base = exploringOfficeLabel({
    officeName: input.officeName,
    state: input.state,
    district: input.district,
    ocdId: input.ocdId,
  });
  return `${base} Primary`;
}

export function floorStatus(input: { inDistrictVotes: number; filed: boolean }): FloorStatus {
  if (input.filed) return "ON THE BALLOT";
  const votes = Number.isFinite(input.inDistrictVotes) ? Math.floor(input.inDistrictVotes) : 0;
  return votes >= IN_DISTRICT_VOTE_GOAL ? "CONTENDER" : "PROSPECTIVE";
}

export function alignmentToPrimary(
  point: { x: number | null | undefined; y: number | null | undefined } | null,
  baseline: AxisPoint,
): number | null {
  if (point?.x == null || point?.y == null) return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return alignmentPercent(euclidean({ x: point.x, y: point.y }, baseline));
}

export function parseTranscript(value: unknown): TranscriptEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is TranscriptEntry =>
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as TranscriptEntry).round === "number" &&
      typeof (row as TranscriptEntry).author_id === "string" &&
      typeof (row as TranscriptEntry).content === "string",
  );
}

/** Keep one rebuttal per candidate. A second filing replaces only that candidate's text. */
export function fileRebuttal(existing: unknown, entry: TranscriptEntry): TranscriptEntry[] {
  const prior = parseTranscript(existing).filter(
    (row) => !(row.round === entry.round && row.author_id === entry.author_id),
  );
  return [...prior, entry];
}

export function rebuttalFor(existing: unknown, authorId: string): string | null {
  const hit = parseTranscript(existing).find(
    (row) => row.round === 2 && row.author_id === authorId && row.content.trim(),
  );
  return hit?.content.trim() ?? null;
}

export function zipCoversDistrict(votingZip: string | null | undefined, districtZips: string[]) {
  const zip = normalizeZip(votingZip);
  if (zip.length !== 5) return false;
  return districtZips.some((entry) => normalizeZip(entry) === zip);
}

/** Verified voter whose ZIP or home division sits in this primary. */
export function inDistrict(input: {
  verified: boolean;
  votingZip?: string | null;
  districtZips: string[];
  homeOcdIds: string[];
  primaryOcdId?: string | null;
}) {
  if (!input.verified) return false;
  if (zipCoversDistrict(input.votingZip, input.districtZips)) return true;
  const target = normalizeOcdId(input.primaryOcdId);
  if (!target) return false;
  return input.homeOcdIds.some((id) => normalizeOcdId(id) === target);
}

export function canFileRebuttal(input: {
  window: ClashWindow;
  viewerId: string | null;
  candidateId: string;
  rebuttal: string | null;
}) {
  return (
    input.window === "rebuttal" &&
    input.viewerId != null &&
    input.viewerId === input.candidateId &&
    !input.rebuttal
  );
}
