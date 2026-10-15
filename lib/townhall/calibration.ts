/** Townhall wedge deck. A later selector can replace this queue; the card only needs an id, an axis, and a sign. */

export const CONFIDENCE_FLOOR = 0.68;
export const CONFIDENCE_CAP = 0.96;
export const CONFIDENCE_SCALE_MAX = 1;
export const CONFIDENCE_STEP = 0.04;
export const STRONG_STEP = 0.05;
export const LEAN_STEP = 0.02;

export const CALIBRATION_TOAST = "Vector calibrated. +4% Confidence.";

export const LIKERT_CHOICES = [
  { id: "strongly_oppose", label: "Strongly Oppose", signed: -STRONG_STEP },
  { id: "lean_no", label: "Lean No", signed: -LEAN_STEP },
  { id: "lean_yes", label: "Lean Yes", signed: LEAN_STEP },
  { id: "strongly_favor", label: "Strongly Favor", signed: STRONG_STEP },
] as const;

export type LikertChoice = (typeof LIKERT_CHOICES)[number]["id"];

export type CalibrationAxis = "x" | "y";

export type CalibrationQuestion = {
  id: string;
  prompt: string;
  axis: CalibrationAxis;
  /**
   * Sign applied to a Favor answer.
   * -1 moves Economic left, or Social toward personal liberty.
   */
  favorSign: -1 | 1;
  /** District cards name the member's House seat when the profile has one. */
  focus: "economic" | "social" | "district";
};

export const CALIBRATION_QUESTIONS = [
  {
    id: "nuclear",
    focus: "economic",
    axis: "x",
    favorSign: 1,
    prompt:
      "The United States should fast-track new nuclear plants and treat them as a primary source of carbon-free power.",
  },
  {
    id: "privacy",
    focus: "social",
    axis: "y",
    favorSign: -1,
    prompt:
      "Congress should require a specific warrant before the government or a large platform can collect a person's private communications.",
  },
  {
    id: "zoning",
    focus: "district",
    axis: "x",
    favorSign: 1,
    prompt:
      "Cities should allow apartments to be built by right, without a single-family zoning veto.",
  },
  {
    id: "wealth-tax",
    focus: "economic",
    axis: "x",
    favorSign: -1,
    prompt: "Congress should levy an annual tax on net household wealth above a high threshold.",
  },
  {
    id: "pregnancy",
    focus: "social",
    axis: "y",
    favorSign: -1,
    prompt: "Federal law should protect the right to end a pregnancy through the first trimester.",
  },
  {
    id: "defense",
    focus: "social",
    axis: "y",
    favorSign: 1,
    prompt:
      "The United States should raise the defense budget and keep forces stationed with treaty allies.",
  },
  {
    id: "unions",
    focus: "economic",
    axis: "x",
    favorSign: -1,
    prompt: "Federal law should make it easier to form a union and raise the national wage floor.",
  },
  {
    id: "school-choice",
    focus: "social",
    axis: "y",
    favorSign: -1,
    prompt: "Parents should be able to direct public education dollars to a charter or private school.",
  },
] as const satisfies readonly CalibrationQuestion[];

export type CalibrationQuestionId = (typeof CALIBRATION_QUESTIONS)[number]["id"];

export type WedgeCard = {
  id: CalibrationQuestionId;
  context: string;
  prompt: string;
};

const QUESTION_BY_ID = new Map(CALIBRATION_QUESTIONS.map((question) => [question.id, question]));
const CHOICE_BY_ID = new Map(LIKERT_CHOICES.map((choice) => [choice.id, choice]));

export function calibrationQuestion(id: string) {
  return QUESTION_BY_ID.get(id as CalibrationQuestionId) ?? null;
}

export function isLikertChoice(value: string): value is LikertChoice {
  return CHOICE_BY_ID.has(value as LikertChoice);
}

function clampAxis(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(-1, value)) * 10000) / 10000;
}

function roundHundredth(value: number) {
  return Math.round(value * 100) / 100;
}

export function wedgeContext(question: CalibrationQuestion, districtLabel: string | null) {
  if (question.focus === "district" && districtLabel) {
    return `Calibrating your U.S. House ${districtLabel} Match`;
  }
  if (question.axis === "x") return "Refining your Economic Axis";
  return "Refining your Social Axis";
}

export function presentWedge(question: CalibrationQuestion, districtLabel: string | null): WedgeCard {
  return {
    id: question.id as CalibrationQuestionId,
    context: wedgeContext(question, districtLabel),
    prompt: question.prompt,
  };
}

/** Mock micro-adjustment. Strong answers move 0.05. Lean answers move 0.02. */
export function applyWedge(
  point: { x: number; y: number },
  question: CalibrationQuestion,
  choice: LikertChoice,
) {
  const signed = CHOICE_BY_ID.get(choice)?.signed ?? 0;
  const delta = signed * question.favorSign;
  if (question.axis === "x") {
    return { x: clampAxis(point.x + delta), y: clampAxis(point.y) };
  }
  return { x: clampAxis(point.x), y: clampAxis(point.y + delta) };
}

export function confidenceAfterAnswer(current: number | null) {
  const base =
    typeof current === "number" && Number.isFinite(current) ? current : CONFIDENCE_FLOOR;
  if (base >= CONFIDENCE_CAP) {
    return {
      score: roundHundredth(Math.min(CONFIDENCE_SCALE_MAX, base)),
      toast: "Vector calibrated. Confidence is holding at 96%.",
      gained: false,
    };
  }
  const score = roundHundredth(Math.min(CONFIDENCE_CAP, base + CONFIDENCE_STEP));
  const gained = roundHundredth(score - base);
  return {
    score,
    gained: gained > 0,
    toast:
      gained + 0.001 >= CONFIDENCE_STEP
        ? CALIBRATION_TOAST
        : "Vector calibrated. Confidence is at 96%.",
  };
}

/** Fill of a meter whose scale runs from the 68% floor to 100%. */
export function confidenceFill(score: number) {
  if (!Number.isFinite(score)) return 0;
  const percent = Math.round(Math.min(CONFIDENCE_SCALE_MAX, Math.max(0, score)) * 100);
  const span = Math.round(CONFIDENCE_SCALE_MAX * 100) - Math.round(CONFIDENCE_FLOOR * 100);
  const fill = ((percent - Math.round(CONFIDENCE_FLOOR * 100)) / span) * 100;
  return Math.min(100, Math.max(0, fill));
}

export function readCalibrationAnswered(value: unknown): CalibrationQuestionId[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const calibration = (value as { calibration?: { answered?: unknown } }).calibration;
  if (!calibration || !Array.isArray(calibration.answered)) return [];
  const seen = new Set<CalibrationQuestionId>();
  for (const entry of calibration.answered) {
    if (typeof entry !== "string") continue;
    const question = calibrationQuestion(entry);
    if (question) seen.add(question.id);
  }
  return CALIBRATION_QUESTIONS.flatMap((question) => (seen.has(question.id) ? [question.id] : []));
}
