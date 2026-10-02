export type AxisPoint = {
  x: number;
  y: number;
};

export const AXIS_MIN = -1;
export const AXIS_MAX = 1;
export const DEFAULT_ELO = 1200;
export const ELO_K = 32;
export const ELO_FLOOR = 100;
export const TIE_MARGIN = 0.03;
export const ADHERENCE_TIE_POINTS = 3;
export const DRIFT_GAIN = 0.12;

/** Widen until a party primary has an open seat. The last step covers the whole plane. */
export const MATCH_RADII = [0.45, 0.8, 1.2, 1.8, Math.sqrt(8)] as const;

export type Party = "democrat" | "republican";

export type CandidateTierName = "pundit" | "declared_candidate" | "frontrunner";

const TIER_RANK: Record<CandidateTierName, number> = {
  pundit: 0,
  declared_candidate: 1,
  frontrunner: 2,
};

export function clampAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(AXIS_MAX, Math.max(AXIS_MIN, value));
  return Math.round(clamped * 10000) / 10000;
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function euclidean(a: AxisPoint, b: AxisPoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Economic below 0 debates in Democratic primaries. */
export function partyFromCoordinate(point: AxisPoint): Party {
  return point.x < 0 ? "democrat" : "republican";
}

/**
 * Closeness of a debater's own coordinate to the primary baseline.
 * 1 is a perfect overlap. Used only on the server.
 */
export function adherenceScore(point: AxisPoint, baseline: AxisPoint): number {
  const max = Math.sqrt(8);
  return clampUnit(1 - euclidean(point, baseline) / max);
}

export function withinTieMargin(scoreA: number, scoreB: number): boolean {
  const scale = Math.max(Math.abs(scoreA), Math.abs(scoreB), 1e-9);
  return Math.abs(scoreA - scoreB) / scale <= TIE_MARGIN;
}

/** Adherence is scored 0–100. A gap of 3 points or less is a tie. */
export function withinAdherencePoints(scoreA: number, scoreB: number): boolean {
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return false;
  return Math.abs(scoreA - scoreB) <= ADHERENCE_TIE_POINTS;
}

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

export function eloDelta(rating: number, opponent: number, outcome: number): number {
  return Math.round(ELO_K * (outcome - expectedScore(rating, opponent)));
}

export function nextElo(rating: number, delta: number): number {
  return Math.max(ELO_FLOOR, Math.round(rating + delta));
}

/**
 * Moving average of this debater's own scored positions.
 * `samples` is how many debates they had already finished.
 * The opponent's score is not an argument.
 */
/**
 * 10% moving average toward this debater's own plotted stance.
 * `new = old * 0.9 + match * 0.1` on each axis.
 */
export function movingAverageDrift(current: AxisPoint, matchPoint: AxisPoint): AxisPoint {
  return {
    x: clampAxis(current.x * 0.9 + clampAxis(matchPoint.x) * 0.1),
    y: clampAxis(current.y * 0.9 + clampAxis(matchPoint.y) * 0.1),
  };
}

export function driftCoordinate(
  current: AxisPoint,
  baseline: AxisPoint,
  ownScore: number,
  samples: number,
): AxisPoint {
  const gain = clampUnit(ownScore) * DRIFT_GAIN;
  const implied = {
    x: clampAxis(current.x + (baseline.x - current.x) * gain),
    y: clampAxis(current.y + (baseline.y - current.y) * gain),
  };
  const weight = Math.max(1, samples);
  return {
    x: clampAxis((current.x * weight + implied.x) / (weight + 1)),
    y: clampAxis((current.y * weight + implied.y) / (weight + 1)),
  };
}

/** Share of the field strictly below this Elo. 0.5 is the top half; 0.9 is the top tenth. */
export function percentileRank(elo: number, field: number[]): number {
  if (field.length === 0) return 0;
  const below = field.filter((value) => value < elo).length;
  return below / field.length;
}

export function tierForStanding(
  elo: number,
  field: number[],
  verified: boolean,
  legalName: string | null | undefined,
): CandidateTierName {
  if (!verified || !legalName?.trim()) return "pundit";
  const percentile = percentileRank(elo, field);
  if (percentile >= 0.9) return "frontrunner";
  if (percentile >= 0.5) return "declared_candidate";
  return "pundit";
}

export function higherTier(a: CandidateTierName, b: CandidateTierName): CandidateTierName {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function parseTier(value: string | null | undefined): CandidateTierName {
  if (value === "declared_candidate" || value === "frontrunner") return value;
  return "pundit";
}

export type RankedPrimary<T> = {
  primary: T;
  distance: number;
};

/**
 * Same-party primaries, closest first.
 * Starts inside a tight radius and widens while the window has no open seats.
 */
export function matchPrimaries<T extends { party: string; openSeats: number } & AxisPoint>(
  user: AxisPoint,
  primaries: T[],
): RankedPrimary<T>[] {
  const party = partyFromCoordinate(user);
  const ranked = primaries
    .filter((primary) => primary.party === party)
    .map((primary) => ({
      primary,
      distance: euclidean(user, primary),
    }))
    .sort((a, b) => a.distance - b.distance || a.primary.x - b.primary.x);

  for (const radius of MATCH_RADII) {
    const within = ranked.filter((row) => row.distance <= radius);
    if (within.some((row) => row.primary.openSeats > 0)) return within;
  }

  return ranked;
}
