import { DEFAULT_ELO } from "@/lib/arena/elo";
import {
  euclideanDistance,
  SIX_AXIS_DIMENSIONS,
  toSixAxisVector,
  type SixAxisVector,
} from "@/lib/ideology/six-axis";
import { parseVector } from "@/lib/ideology/vector";

/** Primary ideological match share of Draft Viability. */
export const PRIMARY_MATCH_WEIGHT = 0.4;
/** General-election win probability share of Draft Viability. */
export const GENERAL_VIABILITY_WEIGHT = 0.3;
/** Normalized debate ELO share of Draft Viability. */
export const NORMALIZED_ELO_WEIGHT = 0.3;

/**
 * Linear ELO window. Default 1200 maps to 50; high-tier 2000 maps to 100.
 */
export const ELO_NORMALIZE_FLOOR = 400;
export const ELO_NORMALIZE_CEILING = 2000;

function toFinite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampPct(value: number) {
  return clamp(toFinite(value), 0, 100);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** Map a raw ELO rating onto a 0–100 scale for the viability mix. */
export function normalizeElo(eloRating: number) {
  const rating = toFinite(eloRating, DEFAULT_ELO);
  const span = ELO_NORMALIZE_CEILING - ELO_NORMALIZE_FLOOR;
  if (span <= 0) return 50;
  return clampPct(((rating - ELO_NORMALIZE_FLOOR) / span) * 100);
}

export type DraftViabilityInput = {
  /** Ideological primary match, 0–100. */
  primaryMatch: number;
  /** Projected general-election viability, 0–100. */
  generalViability: number;
  /** Raw debate ELO; normalized inside the formula. */
  eloRating: number;
};

/**
 * Draft Viability Score: 40% primary match, 30% general viability,
 * 30% normalized ELO.
 */
export function calculateDraftViabilityScore(input: DraftViabilityInput) {
  const primary = clampPct(input.primaryMatch);
  const general = clampPct(input.generalViability);
  const elo = normalizeElo(input.eloRating);

  return round1(
    primary * PRIMARY_MATCH_WEIGHT +
      general * GENERAL_VIABILITY_WEIGHT +
      elo * NORMALIZED_ELO_WEIGHT,
  );
}

export function formatViabilityScore(value: number) {
  const numeric = toFinite(value);
  return Number.isInteger(numeric) ? `${numeric}` : numeric.toFixed(1);
}

/**
 * Cook-style partisan points that map onto the ±1 PVI scale.
 * D+24 is −0.48; R+13 is +0.26; EVEN is 0. Scores already inside ±1
 * are left alone. Larger magnitudes are treated as raw Cook points.
 */
export const PVI_COOK_POINTS = 50;

/**
 * Logistic steepness for general viability. At 6, an R+10 seat (~+0.20)
 * sits near 77 for a Republican and a D+20 seat (~−0.40) falls under 10.
 */
export const GENERAL_PVI_STEEPNESS = 6;

/** How far a missing primary electorate is pulled off the general median. */
const PRIMARY_POLARIZATION = 0.62;

export type PartyLane = "R" | "D";

export type GeneralPath = "Safe R" | "Lean R" | "Toss-up" | "Lean D" | "Safe D";

export type CalculateDraftViabilityInput = {
  ideologyVector: unknown;
  primaryRepVector: unknown;
  primaryDemVector: unknown;
  /**
   * Partisan lean of the seat. −1 is deep Democratic, +1 is deep Republican.
   * A Cook-style score whose magnitude is greater than 1 is divided by 50.
   */
  pviScore: number | null | undefined;
  /** General-electorate coordinate. Used only to synthesize a missing primary lane. */
  generalVector?: unknown;
};

export type DraftViability = {
  lane: PartyLane;
  /** Fit inside the closer primary electorate, 0–100. */
  primaryFit: number;
  /** PVI baseline for that party in the general, 0–100. */
  generalViability: number;
  generalPath: GeneralPath;
  /** Joint gate: primary fit and general viability must both be high. */
  viability: number;
};

export function normalizePviScore(value: number | null | undefined) {
  const numeric = toFinite(value ?? 0);
  if (Math.abs(numeric) > 1) return clamp(numeric / PVI_COOK_POINTS, -1, 1);
  return clamp(numeric, -1, 1);
}

function hasAxisVector(value: unknown) {
  return parseVector(value).length > 0;
}

function axisOr(value: unknown, fallback: SixAxisVector): SixAxisVector {
  return hasAxisVector(value) ? toSixAxisVector(value) : fallback;
}

function polarize(median: SixAxisVector, pole: 0 | 1): SixAxisVector {
  return median.map((value) => {
    const next = value + (pole - value) * PRIMARY_POLARIZATION;
    return clamp(next, 0, 1);
  }) as SixAxisVector;
}

/** Seat rating from normalized PVI. ±0.08 is about R/D+4; ±0.20 is about R/D+10. */
export function generalPathFromPvi(pviScore: number | null | undefined): GeneralPath {
  const pvi = normalizePviScore(pviScore);
  const magnitude = Math.abs(pvi);
  if (magnitude < 0.08) return "Toss-up";
  const party = pvi >= 0 ? "R" : "D";
  if (magnitude < 0.2) return party === "R" ? "Lean R" : "Lean D";
  return party === "R" ? "Safe R" : "Safe D";
}

/**
 * Baseline general win chance for a party in this seat.
 * Positive alignment (the seat leans toward the candidate's party) rises
 * toward 100. A hostile seat falls toward 0. An even seat is 50.
 */
export function generalViabilityFromPvi(lane: PartyLane, pviScore: number | null | undefined) {
  const aligned = lane === "R" ? normalizePviScore(pviScore) : -normalizePviScore(pviScore);
  const raw = 100 / (1 + Math.exp(-GENERAL_PVI_STEEPNESS * aligned));
  return Math.round(clampPct(raw));
}

function primaryFitPercent(ideology: SixAxisVector, electorate: SixAxisVector) {
  const distance = euclideanDistance(ideology, electorate);
  const farthest = Math.sqrt(SIX_AXIS_DIMENSIONS);
  if (farthest <= 0) return 0;
  return Math.round(clampPct(100 * (1 - distance / farthest)));
}

/**
 * Two-stage draft funnel.
 * The candidate's natural primary is the closer of the Republican and
 * Democratic primary electorates (Euclidean distance on the six axes).
 * Primary fit is that lane only. General viability is the seat's PVI
 * read for that party. The composite is their joint probability, so a
 * strong primary in an unwinnable general cannot rank highly.
 */
export function calculateDraftViability(input: CalculateDraftViabilityInput): DraftViability {
  const pvi = normalizePviScore(input.pviScore);
  const generalAnchor = axisOr(input.generalVector, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  const ideology = axisOr(input.ideologyVector, generalAnchor);
  const primaryRep = axisOr(input.primaryRepVector, polarize(generalAnchor, 0));
  const primaryDem = axisOr(input.primaryDemVector, polarize(generalAnchor, 1));

  const repDistance = euclideanDistance(ideology, primaryRep);
  const demDistance = euclideanDistance(ideology, primaryDem);
  const lane: PartyLane =
    repDistance < demDistance ? "R" : demDistance < repDistance ? "D" : pvi >= 0 ? "R" : "D";
  const electorate = lane === "R" ? primaryRep : primaryDem;

  const primaryFit = primaryFitPercent(ideology, electorate);
  const generalViability = generalViabilityFromPvi(lane, pvi);
  const viability = round1((primaryFit * generalViability) / 100);

  return {
    lane,
    primaryFit,
    generalViability,
    generalPath: generalPathFromPvi(pvi),
    viability,
  };
}
