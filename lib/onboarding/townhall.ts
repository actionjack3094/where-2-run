import { buildStanceVector, formatPgStanceVector, roundStanceAxis } from "@/lib/ideology/stance";

export const TOWNHALL_WEIGHTS = ["low", "medium", "dealbreaker"] as const;

export type TownhallWeight = (typeof TOWNHALL_WEIGHTS)[number];

export const TOWNHALL_WEIGHT_LABELS: Record<TownhallWeight, string> = {
  low: "Low Importance",
  medium: "Medium",
  dealbreaker: "Dealbreaker",
};

/** How far a pill pulls the declared position away from neutral. */
export const TOWNHALL_WEIGHT_SCALE: Record<TownhallWeight, number> = {
  low: 0.35,
  medium: 0.7,
  dealbreaker: 1,
};

export const TOWNHALL_STATEMENTS = [
  {
    id: "economy",
    statement:
      "The federal government should raise taxes on high earners, expand public programs, and strengthen unions.",
  },
  {
    id: "foreign_policy",
    statement:
      "The United States should reduce overseas military commitments and favor diplomacy over new interventions.",
  },
  {
    id: "social",
    statement:
      "The law should protect personal liberty in private life, including reproductive rights and civil liberties.",
  },
  {
    id: "environment",
    statement:
      "The United States should phase out fossil fuels on a binding timeline and publicly finance clean energy.",
  },
  {
    id: "immigration",
    statement:
      "Congress should expand legal immigration and create a pathway to citizenship for long-term residents.",
  },
] as const;

export type TownhallId = (typeof TOWNHALL_STATEMENTS)[number]["id"];

export type TownhallAnswer = {
  id: TownhallId;
  /** Slider position. -1 is Strongly Oppose, +1 is Strongly Support. */
  score: number;
  weight: TownhallWeight;
};

const STATEMENT_IDS = new Set<string>(TOWNHALL_STATEMENTS.map((item) => item.id));

function isWeight(value: string): value is TownhallWeight {
  return (TOWNHALL_WEIGHTS as readonly string[]).includes(value);
}

function isTownhallId(value: string): value is TownhallId {
  return STATEMENT_IDS.has(value);
}

function clampPlane(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(-1, value)) * 10000) / 10000;
}

/**
 * Each statement is written toward the left of its axis.
 * Support moves that axis negative; oppose moves it positive.
 * Weight scales how far the answer leaves neutral.
 */
export function townhallAxisScores(answers: TownhallAnswer[]) {
  const raw = {} as Record<TownhallId, number>;
  for (const answer of answers) {
    raw[answer.id] = roundStanceAxis(-answer.score * TOWNHALL_WEIGHT_SCALE[answer.weight]);
  }
  return buildStanceVector(raw);
}

export function townhallCoordinate(answers: TownhallAnswer[]) {
  const axes = townhallAxisScores(answers);
  return {
    x: clampPlane(0.62 * axes.economy + 0.23 * axes.environment + 0.15 * axes.immigration),
    y: clampPlane(0.7 * axes.social + 0.18 * axes.foreign_policy + 0.12 * axes.immigration),
  };
}

export function townhallStanceVector(answers: TownhallAnswer[]) {
  return formatPgStanceVector(townhallAxisScores(answers));
}

export function parseTownhallAnswers(input: unknown): TownhallAnswer[] {
  if (!Array.isArray(input)) {
    throw new Error("File every Townhall statement before continuing.");
  }

  const byId = new Map<TownhallId, TownhallAnswer>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each Townhall answer needs a statement, a slider, and a weight.");
    }
    const record = entry as { id?: unknown; score?: unknown; weight?: unknown };
    const id = typeof record.id === "string" ? record.id : "";
    const weight = typeof record.weight === "string" ? record.weight : "";
    const score = typeof record.score === "number" ? record.score : Number(record.score);
    if (!isTownhallId(id) || !isWeight(weight) || !Number.isFinite(score)) {
      throw new Error("Each Townhall answer needs a statement, a slider, and a weight.");
    }
    byId.set(id, {
      id,
      score: Math.round(Math.min(1, Math.max(-1, score)) * 100) / 100,
      weight,
    });
  }

  if (byId.size !== TOWNHALL_STATEMENTS.length) {
    throw new Error("Mark how much each statement matters before filing the Townhall.");
  }

  return TOWNHALL_STATEMENTS.map((item) => byId.get(item.id)!);
}

export function readTownhallAnswers(value: unknown): TownhallAnswer[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const townhall = (value as { townhall?: { answers?: unknown } }).townhall;
  if (!townhall || !Array.isArray(townhall.answers)) return null;
  try {
    return parseTownhallAnswers(townhall.answers);
  } catch {
    return null;
  }
}
