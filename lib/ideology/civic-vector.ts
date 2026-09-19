import type { CivicStance } from "@/types/database.types";

const ECONOMIC =
  /\b(econom(?:y|ic|ics)?|market|markets|tax(?:es|ation)?|wage|wages|parking|housing|transit|business|fiscal|jobs|trade|rent|property|inflation|fee|fees|developer|developers|mandate|mandates|minimum)\b/gi;
const SOCIAL =
  /\b(libert(?:y|arian|ies)?|freedom|privacy|speech|rights|civil|marijuana|abortion|religion|equity|police|immigration|gender|choice|ban|criminal|justice|protest)\b/gi;
const LOCAL =
  /\b(council|ordinance|district|zoning|neighborhood|local|city|municipal|precinct|mayor|charter|austin|resident|residents|constituent|governance)\b/gi;

function clampAxis(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

function randomAxis() {
  return Math.random() * 2 - 1;
}

function keywordBias(source: string, pattern: RegExp) {
  const hits = source.match(pattern)?.length ?? 0;
  if (hits === 0) return null;
  return clampAxis(Math.min(1, 0.25 + hits * 0.25));
}

export function normalizeCivicVector(values: number[]): [number, number, number] {
  const axes: [number, number, number] = [
    clampAxis(values[0] ?? 0),
    clampAxis(values[1] ?? 0),
    clampAxis(values[2] ?? 0),
  ];
  const magnitude = Math.sqrt(axes[0] ** 2 + axes[1] ** 2 + axes[2] ** 2);
  if (magnitude === 0) return [1, 0, 0];
  return [axes[0] / magnitude, axes[1] / magnitude, axes[2] / magnitude];
}

export function formatCivicVector(values: number[]): string {
  return `[${normalizeCivicVector(values)
    .map((value) => value.toFixed(6))
    .join(",")}]`;
}

export function buildCivicIdeologyVector(
  claim: string,
  argument: string,
  stance: CivicStance,
): [number, number, number] {
  const haystack = `${claim}\n${argument}`.toLowerCase();
  const sign = stance === "Negative" ? -1 : 1;

  const economic = keywordBias(haystack, ECONOMIC);
  const social = keywordBias(haystack, SOCIAL);
  const local = keywordBias(haystack, LOCAL);

  return normalizeCivicVector([
    (economic ?? randomAxis()) * (economic == null ? 1 : sign),
    (social ?? randomAxis()) * (social == null ? 1 : sign),
    (local ?? randomAxis()) * (local == null ? 1 : sign),
  ]);
}
