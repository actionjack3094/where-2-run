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

/** Mandatory baseline. Immigration stays off this set and lives on the deck. */
export const TOWNHALL_BASELINE = TOWNHALL_STATEMENTS.filter(
  (item) => item.id !== "immigration",
);

export const TOWNHALL_DECK = [
  {
    id: "immigration-path",
    topic: "Immigration",
    prompt:
      "Congress should expand legal immigration and create a pathway to citizenship for long-term residents.",
    axis: "immigration",
  },
  {
    id: "single-payer",
    topic: "Healthcare",
    prompt: "The United States should replace private insurance with a public single-payer system.",
    axis: "economy",
  },
  {
    id: "carbon-price",
    topic: "Climate",
    prompt: "Congress should put a rising price on carbon and rebate the revenue to households.",
    axis: "environment",
  },
  {
    id: "alliance-spending",
    topic: "Foreign Policy",
    prompt: "The United States should increase defense spending and keep forward-deployed forces in allied countries.",
    axis: "foreign_policy",
  },
  {
    id: "civil-rights",
    topic: "Civil Rights",
    prompt: "Federal law should expand protections for LGBTQ people in housing, work, and public life.",
    axis: "social",
  },
  {
    id: "border-enforcement",
    topic: "Border",
    prompt: "The federal government should sharply cut legal immigration and fund large-scale deportations.",
    axis: "immigration",
  },
  {
    id: "public-housing",
    topic: "Housing",
    prompt: "The federal government should build and operate a large stock of public housing.",
    axis: "economy",
  },
  {
    id: "nuclear-buildout",
    topic: "Energy",
    prompt: "The United States should fast-track new nuclear plants and keep existing fossil fuel production online.",
    axis: "environment",
  },
] as const satisfies readonly {
  id: string;
  topic: string;
  prompt: string;
  axis: TownhallId;
}[];

export type DeckCardId = (typeof TOWNHALL_DECK)[number]["id"];

export type DeckStance = {
  id: DeckCardId;
  axis: TownhallId;
  /** -1 is Oppose, +1 is Support. A skip is not a stance. */
  score: number;
};

export type TownhallAnswer = {
  id: TownhallId;
  /** Slider position. -1 is Strongly Oppose, +1 is Strongly Support. */
  score: number;
  weight: TownhallWeight;
};

const STATEMENT_IDS = new Set<string>(TOWNHALL_STATEMENTS.map((item) => item.id));
const DECK_BY_ID = new Map(TOWNHALL_DECK.map((card) => [card.id, card]));

const ECONOMIC_WEIGHTS = [
  ["economy", 0.62],
  ["environment", 0.23],
  ["immigration", 0.15],
] as const satisfies readonly (readonly [TownhallId, number])[];

const SOCIAL_WEIGHTS = [
  ["social", 0.7],
  ["foreign_policy", 0.18],
  ["immigration", 0.12],
] as const satisfies readonly (readonly [TownhallId, number])[];

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
 * Axes the member has not answered stay absent so they do not pull the plane.
 */
export function townhallAxisScores(answers: TownhallAnswer[]) {
  const raw = {} as Partial<Record<TownhallId, number>>;
  for (const answer of answers) {
    raw[answer.id] = roundStanceAxis(-answer.score * TOWNHALL_WEIGHT_SCALE[answer.weight]);
  }
  return raw;
}

function projectAxis(
  axes: Partial<Record<TownhallId, number>>,
  weights: readonly (readonly [TownhallId, number])[],
) {
  let sum = 0;
  let present = 0;
  let complete = true;
  for (const [axis, weight] of weights) {
    const value = axes[axis];
    if (value == null || !Number.isFinite(value)) {
      complete = false;
      continue;
    }
    sum += weight * value;
    present += weight;
  }
  if (present === 0) return 0;
  return clampPlane(complete ? sum : sum / present);
}

export function coordinateFromAxes(axes: Partial<Record<TownhallId, number>>) {
  return {
    x: projectAxis(axes, ECONOMIC_WEIGHTS),
    y: projectAxis(axes, SOCIAL_WEIGHTS),
  };
}

export function townhallCoordinate(answers: TownhallAnswer[]) {
  return coordinateFromAxes(townhallAxisScores(answers));
}

/**
 * Fold answered deck cards into the baseline.
 * Cards that were skipped are absent from `deck` and do not move the plane.
 */
export function axesWithDeck(baseline: TownhallAnswer[], deck: DeckStance[]) {
  const axes = townhallAxisScores(baseline);
  const counts = {} as Partial<Record<TownhallId, number>>;
  for (const item of TOWNHALL_STATEMENTS) {
    if (axes[item.id] != null) counts[item.id] = 1;
  }

  for (const stance of deck) {
    const pull = roundStanceAxis(-stance.score);
    const prior = axes[stance.axis];
    const seen = counts[stance.axis] ?? 0;
    if (prior == null || seen === 0) {
      axes[stance.axis] = pull;
      counts[stance.axis] = 1;
      continue;
    }
    axes[stance.axis] = roundStanceAxis((prior * seen + pull) / (seen + 1));
    counts[stance.axis] = seen + 1;
  }

  return axes;
}

export function coordinateWithDeck(baseline: TownhallAnswer[], deck: DeckStance[]) {
  return coordinateFromAxes(axesWithDeck(baseline, deck));
}

function fullStanceAxes(axes: Partial<Record<TownhallId, number>>) {
  const full = {} as Record<TownhallId, number>;
  for (const item of TOWNHALL_STATEMENTS) {
    full[item.id] = axes[item.id] ?? 0;
  }
  return buildStanceVector(full);
}

export function townhallStanceVector(answers: TownhallAnswer[]) {
  return formatPgStanceVector(fullStanceAxes(townhallAxisScores(answers)));
}

export function stanceVectorWithDeck(baseline: TownhallAnswer[], deck: DeckStance[]) {
  return formatPgStanceVector(fullStanceAxes(axesWithDeck(baseline, deck)));
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

  const baselineComplete =
    byId.size === TOWNHALL_BASELINE.length &&
    TOWNHALL_BASELINE.every((item) => byId.has(item.id));
  const fullComplete =
    byId.size === TOWNHALL_STATEMENTS.length &&
    TOWNHALL_STATEMENTS.every((item) => byId.has(item.id));
  if (!baselineComplete && !fullComplete) {
    throw new Error("Mark how much each statement matters before filing the Townhall.");
  }

  const source = fullComplete ? TOWNHALL_STATEMENTS : TOWNHALL_BASELINE;
  return source.map((item) => byId.get(item.id)!);
}

export function parseDeckStances(input: unknown): DeckStance[] {
  if (!Array.isArray(input)) return [];
  const byId = new Map<DeckCardId, DeckStance>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { id?: unknown; score?: unknown; axis?: unknown };
    const id = typeof record.id === "string" ? record.id : "";
    const card = DECK_BY_ID.get(id as DeckCardId);
    if (!card) continue;
    const score = typeof record.score === "number" ? record.score : Number(record.score);
    if (score !== -1 && score !== 1) continue;
    byId.set(card.id, { id: card.id, axis: card.axis, score });
  }
  return TOWNHALL_DECK.flatMap((card) => {
    const stance = byId.get(card.id);
    return stance ? [stance] : [];
  });
}

export function readDeckStances(value: unknown): DeckStance[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const deck = (value as { deck?: { answers?: unknown } }).deck;
  if (!deck || !Array.isArray(deck.answers)) return [];
  return parseDeckStances(deck.answers);
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
