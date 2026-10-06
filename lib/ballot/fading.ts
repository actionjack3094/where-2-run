export const STANCE_STALE_MS = 90 * 24 * 60 * 60 * 1000;
const PLANE_SPAN = Math.sqrt(8);

export function stanceIsStale(lastTouchedAt: string | null, now = Date.now()) {
  if (!lastTouchedAt) return true;
  const at = Date.parse(lastTouchedAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= STANCE_STALE_MS;
}

export function matchPercentFromDistance(distance: number) {
  const span = Math.min(Math.max(distance, 0), PLANE_SPAN);
  return Math.round((1 - span / PLANE_SPAN) * 100);
}

/** A stale stance keeps a lower confidence than the raw distance match. */
export function fadedMatchPercent(percent: number, stale: boolean) {
  const score = Math.max(0, Math.min(100, Math.round(percent)));
  if (!stale) return score;
  return Math.max(0, score - 15);
}

export function matchConfidenceLabel(percent: number, stale: boolean) {
  const shown = fadedMatchPercent(percent, stale);
  return stale ? `${shown}% Match · Stance Stale` : `${shown}% Match`;
}
