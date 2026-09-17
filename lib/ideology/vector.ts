import type { IdeologyVector } from "@/types/database.types";

export const IDEOLOGY_DIMENSIONS = 10;

export function parseVector(value: unknown): IdeologyVector {
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return trimmed
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isFinite(entry));
  }

  return [];
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeVector(values: number[]): IdeologyVector {
  const padded = Array.from(
    { length: IDEOLOGY_DIMENSIONS },
    (_, index) => values[index] ?? 0.5,
  );
  return padded.map(clamp01);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (denominator === 0) return 0;
  return dot / denominator;
}

export function similarityToPercent(similarity: number): number {
  return Math.round(clamp01(similarity) * 100);
}
