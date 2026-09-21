import type { StanceAxis, StanceVector } from "@/types/database.types";

export const STANCE_AXES = [
  "economy",
  "foreign_policy",
  "social",
  "environment",
  "immigration",
] as const satisfies readonly StanceAxis[];

export type StanceChoice = {
  id: string;
  label: string;
  score: number;
};

export type StanceSliderQuestion = {
  id: StanceAxis;
  kind: "slider";
  topic: string;
  prompt: string;
  leftLabel: string;
  rightLabel: string;
};

export type StanceChoiceQuestion = {
  id: StanceAxis;
  kind: "choice";
  topic: string;
  prompt: string;
  options: StanceChoice[];
};

export type StanceQuestion = StanceSliderQuestion | StanceChoiceQuestion;

export const BASELINE_QUESTIONS: StanceQuestion[] = [
  {
    id: "economy",
    kind: "slider",
    topic: "Economy",
    prompt: "Where should the state sit in the economy?",
    leftLabel: "Tax wealth, expand public programs, and strengthen unions.",
    rightLabel: "Cut taxes, shrink regulation, and let markets allocate capital.",
  },
  {
    id: "foreign_policy",
    kind: "choice",
    topic: "Foreign Policy",
    prompt: "What is America's proper role abroad?",
    options: [
      {
        id: "fp-withdraw",
        label: "Withdraw from alliances and end overseas wars.",
        score: -1,
      },
      {
        id: "fp-diplomacy",
        label: "Diplomacy first; use force only with allies and a clear mandate.",
        score: -0.5,
      },
      {
        id: "fp-deterrent",
        label: "Keep existing alliances and a capable deterrent, without new wars.",
        score: 0.25,
      },
      {
        id: "fp-project",
        label: "Project power, expand deterrence, and act unilaterally when needed.",
        score: 1,
      },
    ],
  },
  {
    id: "social",
    kind: "slider",
    topic: "Social",
    prompt: "How should the law treat personal liberty and tradition?",
    leftLabel: "Codify expansive civil rights and keep the state out of private life.",
    rightLabel: "Restore traditional social defaults and broaden religious exemptions.",
  },
  {
    id: "environment",
    kind: "choice",
    topic: "Environment",
    prompt: "How should climate and energy policy be set?",
    options: [
      {
        id: "env-phaseout",
        label: "Phase out fossil fuels on a binding timeline and publicly finance renewables.",
        score: -1,
      },
      {
        id: "env-price",
        label: "Price carbon, keep targeted clean-energy subsidies, and let markets choose the mix.",
        score: -0.33,
      },
      {
        id: "env-all",
        label: "Pursue all-of-the-above: keep oil and gas while expanding nuclear and renewables.",
        score: 0.33,
      },
      {
        id: "env-drill",
        label: "Expand domestic oil and gas production and roll back climate mandates.",
        score: 1,
      },
    ],
  },
  {
    id: "immigration",
    kind: "choice",
    topic: "Immigration",
    prompt: "Where should immigration and border policy land?",
    options: [
      {
        id: "imm-path",
        label: "Expand legal immigration and create a broad pathway to citizenship.",
        score: -1,
      },
      {
        id: "imm-mixed",
        label: "Legalize long-term residents, raise legal caps, and keep targeted enforcement.",
        score: -0.33,
      },
      {
        id: "imm-merit",
        label: "Secure the border, shift to merit-based admissions, and skip broad amnesty.",
        score: 0.33,
      },
      {
        id: "imm-deport",
        label: "Cut legal immigration sharply and pursue large-scale deportations.",
        score: 1,
      },
    ],
  },
];

export function isMissingStanceColumn(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /stance_vector/i.test(message)
  );
}

export function clampStanceAxis(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

export function roundStanceAxis(value: number) {
  return Math.round(clampStanceAxis(value) * 100) / 100;
}

export function formatStanceAxis(value: number) {
  const rounded = roundStanceAxis(value);
  if (rounded > 0) return `+${rounded.toFixed(2)}`;
  return rounded.toFixed(2);
}

export function buildStanceVector(
  answers: Partial<Record<StanceAxis, number>>,
): StanceVector {
  const vector = {} as StanceVector;

  for (const axis of STANCE_AXES) {
    const raw = answers[axis];
    if (raw == null || !Number.isFinite(raw)) {
      throw new Error(`Answer every question before filing your stance vector.`);
    }
    vector[axis] = roundStanceAxis(raw);
  }

  return vector;
}
