/** Mock Anti-Troll AI Grader. Slight vector deltas only — never a full rewrite. */

export const IDEOLOGY_DIMENSIONS = 10;
export const MAX_ABS_DELTA = 0.04;

const PROGRESSIVE =
  /\b(climate|renewable|union|medicare|pathway|codify|public option|housing|transit|tax the rich|community responder)\b/i;
const CONSERVATIVE =
  /\b(drill|border|deport|merit-based|tax cut|police|zero-tolerance|religious liberty|fossil|spending cut)\b/i;
const TROLL =
  /\b(lol+|lmao|asdg?f|clickbait|first!|troll|idk|whatever|stupid|idiot|trash|dumb)\b/i;
const LOCAL =
  /\b(district|constituent|ballot|ordinance|budget|school|zip|neighborhood|precinct|council)\b/i;

export type GradeResult = {
  nextVector: number[];
  delta: number[];
  trollScore: number;
  quality: number;
  inferredLean: number;
  note: string;
};

export function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
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
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export function normalizeVector(values: number[]): number[] {
  return Array.from({ length: IDEOLOGY_DIMENSIONS }, (_, index) =>
    clamp01(values[index] ?? 0.5),
  );
}

export function formatVector(values: number[]): string {
  return `[${normalizeVector(values).map((value) => value.toFixed(6)).join(",")}]`;
}

function clampDelta(value: number): number {
  return Math.min(MAX_ABS_DELTA, Math.max(-MAX_ABS_DELTA, value));
}

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(new RegExp(pattern, "gi")) ?? []).length;
}

/**
 * Compare debate text to the district median and return a small coordinate shift.
 * Trolling / off-topic posts drift away from the center so they cannot farm alignment.
 */
export function gradeDebateText(
  content: string,
  topic: string,
  currentRaw: unknown,
  districtRaw: unknown,
): GradeResult {
  const current = normalizeVector(parseVector(currentRaw));
  const district = normalizeVector(parseVector(districtRaw));
  const text = content.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const haystack = `${topic}\n${text}`.toLowerCase();

  const progressiveHits = countMatches(haystack, PROGRESSIVE);
  const conservativeHits = countMatches(haystack, CONSERVATIVE);
  const stanceTotal = progressiveHits + conservativeHits;
  const inferredLean =
    stanceTotal === 0 ? 0.5 : clamp01(progressiveHits / stanceTotal);

  const inferred = normalizeVector([
    inferredLean,
    inferredLean,
    1 - inferredLean,
    1 - inferredLean,
    inferredLean,
    inferredLean,
    1 - inferredLean,
    1 - inferredLean,
    inferredLean,
    inferredLean,
  ]);

  const capsRatio =
    text.length === 0
      ? 0
      : (text.replace(/[^A-Z]/g, "").length / Math.max(text.replace(/[^a-zA-Z]/g, "").length, 1));
  const shortPenalty = words.length < 12 ? 0.55 : words.length < 28 ? 0.25 : 0;
  const trollLexicon = TROLL.test(text) ? 0.35 : 0;
  const topicTerms = topic
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 4);
  const overlap =
    topicTerms.length === 0
      ? 1
      : topicTerms.filter((term) => text.toLowerCase().includes(term)).length /
        topicTerms.length;
  const offTopic = overlap < 0.15 ? 0.4 : 0;
  const trollScore = clamp01(shortPenalty + trollLexicon + offTopic + capsRatio * 0.5);
  const quality = clamp01(
    1 - trollScore + (LOCAL.test(text) ? 0.12 : 0) + Math.min(words.length, 80) / 400,
  );

  const delta: number[] = [];
  const nextVector: number[] = [];

  for (let i = 0; i < IDEOLOGY_DIMENSIONS; i += 1) {
    const towardDistrict = district[i] - current[i];
    const blendedTarget = district[i] * 0.65 + inferred[i] * 0.35;
    const towardTarget = blendedTarget - current[i];

    let step: number;
    if (trollScore >= 0.45) {
      // Anti-troll: refuse a free move toward the median; drift slightly away.
      const away = current[i] - district[i];
      const sign = away === 0 ? (current[i] >= 0.5 ? 1 : -1) : Math.sign(away);
      step = sign * MAX_ABS_DELTA * (0.35 + trollScore * 0.4);
    } else {
      step = towardTarget * (0.12 + quality * 0.18);
      if (Math.abs(towardDistrict) < 0.02) {
        step += towardTarget * 0.04;
      }
    }

    const applied = clampDelta(step);
    delta.push(applied);
    nextVector.push(clamp01(current[i] + applied));
  }

  const maxApplied = Math.max(...delta.map((value) => Math.abs(value)));
  if (maxApplied < 0.002) {
    let widest = 0;
    let widestGap = 0;
    for (let i = 0; i < IDEOLOGY_DIMENSIONS; i += 1) {
      const gap = Math.abs(district[i] - current[i]);
      if (gap > widestGap) {
        widestGap = gap;
        widest = i;
      }
    }
    const nudge = trollScore >= 0.45 ? -MAX_ABS_DELTA * 0.25 : MAX_ABS_DELTA * 0.25;
    const signed = Math.sign(district[widest] - current[widest]) || 1;
    delta[widest] = clampDelta(signed * nudge);
    nextVector[widest] = clamp01(current[widest] + delta[widest]);
  }

  let note =
    "Slight shift toward the district median, weighted by the stance in this filing.";
  if (trollScore >= 0.45) {
    note =
      "Troll or off-topic filing. Vector drifts away from the district center instead of farming alignment.";
  } else if (quality >= 0.75) {
    note =
      "On-topic, locally framed argument. Small nudge toward the seat's ideological center.";
  }

  return { nextVector, delta, trollScore, quality, inferredLean, note };
}
