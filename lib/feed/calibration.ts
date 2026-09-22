import { QUIZ_QUESTIONS } from "@/lib/ideology/questions";
import { SIX_AXIS_IDS, type SixAxisId } from "@/lib/ideology/six-axis";
import type { CalibrationPrompt } from "@/lib/feed/types";

function isSixAxisId(value: string): value is SixAxisId {
  return (SIX_AXIS_IDS as readonly string[]).includes(value);
}

function axisFromTopic(topic: string): SixAxisId {
  const haystack = topic.toLowerCase();
  if (/\b(border|immigra|asylum|visa|ice)\b/.test(haystack)) return "immigration";
  if (/\b(police|crime|safety|prosecutor|jail|fentanyl)\b/.test(haystack)) return "safety";
  if (/\b(abortion|lgbtq|civil rights?|religion|gender)\b/.test(haystack)) return "social";
  if (/\b(medicare|medicaid|health\s?care|hospital|insur)\b/.test(haystack)) return "healthcare";
  if (/\b(climate|fossil|renewable|emissions|energy|drill)\b/.test(haystack)) return "climate";
  return "economy";
}

const TRENDING_OPTIONS = [
  { id: "affirm", label: "Strongly affirm this proposition.", score: 1 },
  {
    id: "lean-yes",
    label: "Support it, but only with a narrower local mechanism.",
    score: 0.66,
  },
  {
    id: "lean-no",
    label: "Oppose it. I would file a competing approach.",
    score: 0.33,
  },
  { id: "reject", label: "Strongly reject this proposition.", score: 0 },
] as const;

export function buildCalibrationPrompt(trendingTopic?: string | null): CalibrationPrompt {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const fallback = QUIZ_QUESTIONS[dayIndex % QUIZ_QUESTIONS.length] ?? QUIZ_QUESTIONS[0];
  const axisId = isSixAxisId(fallback.id) ? fallback.id : "economy";

  if (trendingTopic?.trim()) {
    const matched = axisFromTopic(trendingTopic);
    return {
      id: `trending-${matched}`,
      axisId: matched,
      axisIndex: SIX_AXIS_IDS.indexOf(matched),
      issueLabel: "Trending issue",
      prompt: trendingTopic.trim(),
      options: [...TRENDING_OPTIONS],
    };
  }

  return {
    id: fallback.id,
    axisId,
    axisIndex: Math.max(0, SIX_AXIS_IDS.indexOf(axisId)),
    issueLabel: "Quick Calibration",
    prompt: fallback.prompt,
    options: fallback.options.map((option) => ({
      id: option.id,
      label: option.label,
      score: option.score,
    })),
  };
}
