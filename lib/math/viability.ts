import { DEFAULT_ELO } from "@/lib/arena/elo";

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
