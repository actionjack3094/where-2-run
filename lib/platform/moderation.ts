/** Operators who can open Civic Moderation without profiles.is_admin. */
export const ADMIN_EMAILS: readonly string[] = [];

export const BANNED_ARENA_MESSAGE = "This account is banned from the arena.";

const REASON_MIN = 3;
const REASON_MAX = 1000;

export type PendingFlag = {
  id: string;
  reason: string;
  createdAt: string;
  debateId: string;
  stance: string;
  offenderId: string;
  offenderName: string;
  offenderEmail: string | null;
};

export function adminAllowlist() {
  const fromEnv = (process.env.PLATFORM_ADMIN_EMAILS ?? process.env.PLATFORM_ADMIN_EMAIL ?? "")
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
  return [...ADMIN_EMAILS.map((email) => email.toLowerCase()), ...fromEnv];
}

export function isPlatformAdmin(
  email: string | null | undefined,
  isAdmin: boolean,
  allowlist: readonly string[] = adminAllowlist(),
) {
  if (isAdmin) return true;
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized.includes("@")) return false;
  return allowlist.some((entry) => entry.trim().toLowerCase() === normalized);
}

export function cleanReportReason(reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) return null;
  return trimmed;
}

export function reportedStance(
  debate: {
    candidate_a_id: string;
    candidate_b_id: string | null;
    stance_a: string;
    stance_b: string | null;
  },
  offenderId: string,
) {
  if (offenderId === debate.candidate_a_id) return debate.stance_a;
  if (debate.candidate_b_id && offenderId === debate.candidate_b_id) return debate.stance_b ?? "";
  return null;
}
