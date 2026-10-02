import { parseVector } from "@/lib/ideology/vector";

export const STANCE_AXIS_IDS = ["economic", "social", "governance"] as const;

export type StanceAxisId = (typeof STANCE_AXIS_IDS)[number];

/** Economic, social, and governance coordinates, each in [-1, 1]. */
export type AxisStance = Record<StanceAxisId, number>;

export type AxisOption = {
  id: string;
  label: string;
  score: number;
};

export type AxisQuestion = {
  id: StanceAxisId;
  topic: string;
  prompt: string;
  options: AxisOption[];
};

export const AXIS_QUESTIONS: AxisQuestion[] = [
  {
    id: "economic",
    topic: "Economic",
    prompt: "Where should the state sit in the economy?",
    options: [
      {
        id: "econ-public",
        label: "Raise taxes on high earners, expand public programs, and strengthen unions.",
        score: -1,
      },
      {
        id: "econ-mixed",
        label: "Keep progressive taxes and spend on targeted industrial policy.",
        score: -0.33,
      },
      {
        id: "econ-market",
        label: "Cut regulation and trim taxes at the margin.",
        score: 0.33,
      },
      {
        id: "econ-cut",
        label: "Deeply cut taxes and federal spending, and unwind labor mandates.",
        score: 1,
      },
    ],
  },
  {
    id: "social",
    topic: "Social",
    prompt: "How should the law treat personal liberty and tradition?",
    options: [
      {
        id: "social-rights",
        label: "Codify expansive civil rights and keep the state out of private life.",
        score: -1,
      },
      {
        id: "social-statutes",
        label: "Enforce existing civil-rights statutes and limit new morals legislation.",
        score: -0.33,
      },
      {
        id: "social-states",
        label: "Return contested social policy to the states and broaden religious exemptions.",
        score: 0.33,
      },
      {
        id: "social-tradition",
        label: "Set national traditional social defaults.",
        score: 1,
      },
    ],
  },
  {
    id: "governance",
    topic: "Governance",
    prompt: "Where should political power sit?",
    options: [
      {
        id: "gov-local",
        label: "Push decisions down to cities and states, and limit federal mandates.",
        score: -1,
      },
      {
        id: "gov-floor",
        label: "Keep a federal floor and let states run most programs.",
        score: -0.33,
      },
      {
        id: "gov-standards",
        label: "Set national standards and leave administration to local governments.",
        score: 0.33,
      },
      {
        id: "gov-federal",
        label: "Centralize policy in federal agencies under uniform national rules.",
        score: 1,
      },
    ],
  },
];

export function normalizeAxisScore(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Each ideological answer needs a numeric score.");
  }
  const scaled = Math.abs(value) > 1 ? value / 100 : value;
  const clamped = Math.min(1, Math.max(-1, scaled));
  return Math.round(clamped * 10000) / 10000;
}

export function calibrateAxisStance(answers: Partial<Record<StanceAxisId, number>>): AxisStance {
  const stance = {} as AxisStance;
  for (const axis of STANCE_AXIS_IDS) {
    const raw = answers[axis];
    if (raw == null || !Number.isFinite(raw)) {
      throw new Error("Answer the economic, social, and governance questions.");
    }
    stance[axis] = normalizeAxisScore(raw);
  }
  return stance;
}

export function euclideanAxisDistance(left: AxisStance, right: AxisStance) {
  const economic = left.economic - right.economic;
  const social = left.social - right.social;
  const governance = left.governance - right.governance;
  return Math.sqrt(economic * economic + social * social + governance * governance);
}

function unitInterval(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/**
 * District medians are the 10-question quiz in [0, 1].
 * Index 9 is the economic plank, index 1 is social, index 3 is centralized enforcement.
 * Map each to [-1, 1] so Euclidean distance matches the onboarding axes.
 */
export function stanceFromDistrictMedian(value: unknown): AxisStance | null {
  const raw = parseVector(value);
  if (raw.length < 10) return null;
  return {
    economic: normalizeAxisScore(1 - 2 * unitInterval(raw[9] ?? 0.5)),
    social: normalizeAxisScore(1 - 2 * unitInterval(raw[1] ?? 0.5)),
    governance: normalizeAxisScore(2 * unitInterval(raw[3] ?? 0.5) - 1),
  };
}

export function stanceFromStoredVector(value: unknown): AxisStance | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Partial<Record<StanceAxisId, unknown>>;
    const economic = Number(record.economic);
    const social = Number(record.social);
    const governance = Number(record.governance);
    if ([economic, social, governance].every((entry) => Number.isFinite(entry))) {
      return calibrateAxisStance({ economic, social, governance });
    }
  }

  const raw = parseVector(value);
  if (raw.length < 3) return null;
  return calibrateAxisStance({
    economic: raw[0] ?? 0,
    social: raw[1] ?? 0,
    governance: raw[2] ?? 0,
  });
}

/** pgvector stance_vector is vector(6). The first three slots are the onboarding axes. */
export function formatPgAxisStance(stance: AxisStance) {
  const axes = [stance.economic, stance.social, stance.governance, 0, 0, 0];
  return `[${axes.map((value) => value.toFixed(4)).join(",")}]`;
}

export function rankByAxisStance<T extends { median_ideology_vector?: unknown }>(
  stance: AxisStance,
  rows: readonly T[],
) {
  return rows
    .flatMap((row) => {
      const centroid = stanceFromDistrictMedian(row.median_ideology_vector);
      if (!centroid) return [];
      return [{ ...row, distance: euclideanAxisDistance(stance, centroid) }];
    })
    .sort((left, right) => left.distance - right.distance);
}
