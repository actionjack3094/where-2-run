import { buildUserVector } from "@/lib/ideology/questions";
import { normalizeVector } from "@/lib/ideology/vector";

export const LIKERT_MIN = 1;
export const LIKERT_MAX = 5;

export const LIKERT_POINTS = [
  { value: 1, score: 0, label: "Strongly Oppose" },
  { value: 2, score: 0.25, label: "Oppose" },
  { value: 3, score: 0.5, label: "Neutral" },
  { value: 4, score: 0.75, label: "Support" },
  { value: 5, score: 1, label: "Strongly Support" },
] as const;

export type LikertValue = (typeof LIKERT_POINTS)[number]["value"];

export const CORE_POLICY_PROMPTS = [
  {
    id: "climate",
    topic: "Energy & Climate",
    prompt:
      "Phase out fossil fuels on a binding timeline and publicly finance a renewable build-out.",
  },
  {
    id: "healthcare",
    topic: "Healthcare",
    prompt:
      "Move to a public single-payer system that replaces private insurance.",
  },
  {
    id: "immigration",
    topic: "Immigration",
    prompt:
      "Expand legal immigration and create a broad pathway to citizenship.",
  },
  {
    id: "economy",
    topic: "Economy & Labor",
    prompt: "Raise taxes on high earners and corporations, and strengthen unions.",
  },
  {
    id: "social",
    topic: "Civil Rights",
    prompt:
      "Codify abortion rights nationally and expand LGBTQ civil-rights protections.",
  },
  {
    id: "safety",
    topic: "Public Safety",
    prompt:
      "Shift funds from patrol toward prevention, mental health, and community responders.",
  },
] as const;

export type PolicyPromptId = (typeof CORE_POLICY_PROMPTS)[number]["id"];

export type OnboardingQuiz = Record<PolicyPromptId, number>;

export const OFFICE_OPTIONS = [
  "U.S. House",
  "U.S. Senate",
  "Governor",
  "State Legislature",
  "Mayor",
  "City Council",
  "School Board",
  "Other",
] as const;

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 80;
export const BIO_MAX = 280;
export const STATE_MAX = 40;

export function likertLabel(value: number) {
  const point = LIKERT_POINTS.find((entry) => entry.value === value);
  return point?.label ?? "Neutral";
}

export function likertToScore(value: number): number {
  const point = LIKERT_POINTS.find((entry) => entry.value === value);
  if (point) return point.score;
  if (value >= 0 && value <= 1) return value;
  if (value >= LIKERT_MIN && value <= LIKERT_MAX) {
    return (value - LIKERT_MIN) / (LIKERT_MAX - LIKERT_MIN);
  }
  throw new Error("Each policy prompt needs a rating from Strongly Oppose to Strongly Support.");
}

export function parseQuizToIdeologyVector(quiz: Partial<OnboardingQuiz> | Record<string, number>) {
  const scores = CORE_POLICY_PROMPTS.map((prompt) => {
    const raw = quiz[prompt.id];
    if (raw == null || !Number.isFinite(raw)) {
      throw new Error("Answer every policy prompt before filing your ticket.");
    }
    return likertToScore(raw);
  });

  return normalizeVector(buildUserVector(scores));
}

export function defaultOnboardingQuiz(): OnboardingQuiz {
  return {
    climate: 3,
    healthcare: 3,
    immigration: 3,
    economy: 3,
    social: 3,
    safety: 3,
  };
}
