import type { District } from "@/types/database.types";
import {
  cosineSimilarity,
  normalizeVector,
  parseVector,
  similarityToPercent,
} from "@/lib/ideology/vector";

export type PartisanLean = "D" | "R";

export type DistrictMatch = {
  district: District;
  similarity: number;
  matchPercent: number;
};

export type FunnelMatches = {
  safePrimary: DistrictMatch;
  tossUpGeneral: DistrictMatch;
  lean: PartisanLean;
};

function pvi(district: District): number {
  return district.pvi_score ?? 0;
}

export function isTossUp(district: District): boolean {
  if (district.historical_lean && /toss-?up/i.test(district.historical_lean)) {
    return true;
  }
  return Math.abs(pvi(district)) < 8;
}

export function isSafeSeat(district: District): boolean {
  return Math.abs(pvi(district)) >= 15;
}

export function inferPartisanLean(vector: number[]): PartisanLean {
  const progressive =
    (vector[0] + vector[1] + vector[4] + vector[5] + vector[8] + vector[9]) / 6;
  const conservative = (vector[2] + vector[3] + vector[6] + vector[7]) / 4;
  return progressive >= conservative ? "D" : "R";
}

export function isSafeForLean(district: District, lean: PartisanLean): boolean {
  if (!isSafeSeat(district)) return false;
  return lean === "D" ? pvi(district) < 0 : pvi(district) > 0;
}

export function scoreDistricts(
  userVector: number[],
  districts: District[],
): DistrictMatch[] {
  const normalizedUser = normalizeVector(userVector);

  return districts
    .map((district) => {
      const median = normalizeVector(parseVector(district.median_ideology_vector));
      const similarity = cosineSimilarity(normalizedUser, median);
      return {
        district: { ...district, median_ideology_vector: median },
        similarity,
        matchPercent: similarityToPercent(similarity),
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

export function pickFunnelMatches(
  userVector: number[],
  districts: District[],
): FunnelMatches | null {
  if (districts.length === 0) return null;

  const ranked = scoreDistricts(userVector, districts);
  const lean = inferPartisanLean(normalizeVector(userVector));

  const tossUpGeneral =
    ranked.find((match) => isTossUp(match.district)) ??
    ranked.find((match) => Math.abs(pvi(match.district)) < 10) ??
    ranked[ranked.length - 1];

  const safePrimary =
    ranked.find(
      (match) =>
        isSafeForLean(match.district, lean) &&
        match.district.id !== tossUpGeneral.district.id,
    ) ??
    ranked.find(
      (match) =>
        isSafeSeat(match.district) &&
        match.district.id !== tossUpGeneral.district.id,
    ) ??
    ranked.find((match) => match.district.id !== tossUpGeneral.district.id) ??
    ranked[0];

  return { safePrimary, tossUpGeneral, lean };
}
