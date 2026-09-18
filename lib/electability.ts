import { normalizeVector, parseVector } from "@/lib/ideology/vector";
import type { District, DistrictLevel, ElectabilityScore } from "@/types/database.types";

export type ContestFavored = "Primary" | "General";

export type ContestOutlook = {
  primaryPct: number;
  generalPct: number;
  favored: ContestFavored;
};

export type ElectabilityMatch = ElectabilityScore & {
  district: District;
};

export function toNumber(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeZip(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\D/g, "").slice(0, 5);
}

export function zipMatches(userZip: string | null | undefined, districtZip: string | null | undefined) {
  const left = normalizeZip(userZip);
  const right = normalizeZip(districtZip);
  return left.length === 5 && left === right;
}

export function formatMatchPct(value: number | string | null | undefined) {
  return `${Math.round(toNumber(value))}%`;
}

export function formatElectability(value: number | string | null | undefined) {
  const numeric = toNumber(value);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric >= 100 ? 0 : 1,
  }).format(numeric);
}

export function districtLevel(value: DistrictLevel | string | null | undefined): "local" | "state" | "federal" | null {
  const level = (value ?? "").toLowerCase();
  if (level === "local" || level === "state" || level === "federal") return level;
  return null;
}

export function ideologicalExtremity(vector: unknown) {
  const values = normalizeVector(parseVector(vector));
  if (values.length === 0) return 0.5;
  const mean = values.reduce((sum, entry) => sum + Math.abs(entry - 0.5), 0) / values.length;
  return Math.min(1, Math.max(0, mean * 2));
}

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.min(95, Math.max(5, Math.round(value)));
}

export function projectContestOutlook(input: {
  pviScore: number | string | null | undefined;
  matchPercent: number | string | null | undefined;
  ideologyVector: unknown;
}): ContestOutlook {
  const absPvi = Math.abs(toNumber(input.pviScore));
  const extreme = ideologicalExtremity(input.ideologyVector);
  const match = Math.min(1, Math.max(0, toNumber(input.matchPercent) / 100));
  const matchWeight = 0.5 + 0.5 * match;

  const primaryRaw = 32 + absPvi * 0.85 + extreme * (absPvi >= 8 ? 30 : 12);
  const generalRaw = 68 - absPvi * 1.05 - extreme * 26 + (absPvi < 8 ? 14 : 0);

  const primaryPct = clampPct(primaryRaw * matchWeight);
  const generalPct = clampPct(generalRaw * matchWeight);

  return {
    primaryPct,
    generalPct,
    favored: primaryPct >= generalPct ? "Primary" : "General",
  };
}

export function unwrapDistrict(value: District | District[] | null | undefined) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function rankMatches(rows: ElectabilityMatch[]) {
  return [...rows].sort((a, b) => {
    const electability = toNumber(b.electability_multiplier) - toNumber(a.electability_multiplier);
    if (electability !== 0) return electability;
    return toNumber(b.ideological_match_pct) - toNumber(a.ideological_match_pct);
  });
}
