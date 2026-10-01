/** 24-hour window after a debate is sealed during which constituents may appeal. */
export const APPEAL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const APPEAL_REASON_MAX = 2000;

export function isResolvedDebate(status: string | null | undefined) {
  return status === "completed" || status === "resolved";
}

export type DebateResolutionClock = {
  resolved_at?: string | null;
  updated_at?: string | null;
  elo_applied_at?: string | null;
  expires_at?: string | null;
};

/** Prefer resolved_at / updated_at; elo_applied_at is when the outcome was sealed. */
export function resolutionTimestamp(debate: DebateResolutionClock) {
  const now = Date.now();
  for (const raw of [
    debate.resolved_at,
    debate.updated_at,
    debate.elo_applied_at,
    debate.expires_at,
  ]) {
    if (!raw) continue;
    const at = Date.parse(raw);
    if (Number.isNaN(at) || at > now) continue;
    return at;
  }
  return null;
}

export function withinAppealWindow(debate: DebateResolutionClock) {
  const at = resolutionTimestamp(debate);
  if (at == null) return false;
  const elapsed = Date.now() - at;
  return elapsed >= 0 && elapsed <= APPEAL_WINDOW_MS;
}
