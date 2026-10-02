import { clampAxis, type AxisPoint } from "@/lib/platform/scoring";

export type DiagnosticAxis = "economic" | "social";

export type DiagnosticOption = {
  id: string;
  label: string;
  score: number;
};

export type DiagnosticQuestion = {
  id: string;
  axis: DiagnosticAxis;
  topic: string;
  prompt: string;
  options: DiagnosticOption[];
};

const SCALE: DiagnosticOption[] = [
  { id: "left", label: "Strongly that way", score: -1 },
  { id: "lean-left", label: "Lean that way", score: -0.33 },
  { id: "lean-right", label: "Lean the other way", score: 0.33 },
  { id: "right", label: "Strongly the other way", score: 1 },
];

function options(
  prefix: string,
  left: string,
  leanLeft: string,
  leanRight: string,
  right: string,
): DiagnosticOption[] {
  return [
    { id: `${prefix}-a`, label: left, score: SCALE[0].score },
    { id: `${prefix}-b`, label: leanLeft, score: SCALE[1].score },
    { id: `${prefix}-c`, label: leanRight, score: SCALE[2].score },
    { id: `${prefix}-d`, label: right, score: SCALE[3].score },
  ];
}

export const DIAGNOSTIC_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: "taxes",
    axis: "economic",
    topic: "Economic",
    prompt: "Taxes on high earners and large corporations should…",
    options: options(
      "taxes",
      "Rise, and fund broader public programs.",
      "Rise modestly for targeted programs.",
      "Stay about where they are.",
      "Fall, including on capital and estates.",
    ),
  },
  {
    id: "labor",
    axis: "economic",
    topic: "Economic",
    prompt: "Unions and labor rules should…",
    options: options(
      "labor",
      "Expand, with sector-wide bargaining.",
      "Stay protected, with easier organizing.",
      "Loosen at the margin.",
      "Give way to individual contracts.",
    ),
  },
  {
    id: "health",
    axis: "economic",
    topic: "Economic",
    prompt: "Who should pay for medical care?",
    options: options(
      "health",
      "A public plan that replaces private insurance.",
      "A public option beside private plans.",
      "Private plans, with a thinner safety net.",
      "Individuals and insurers, with little federal role.",
    ),
  },
  {
    id: "regulation",
    axis: "economic",
    topic: "Economic",
    prompt: "Federal rules on business should…",
    options: options(
      "regulation",
      "Tighten on finance, mergers, and workplace safety.",
      "Hold, and close obvious gaps.",
      "Trim where costs outweigh benefits.",
      "Roll back toward a much smaller code.",
    ),
  },
  {
    id: "trade",
    axis: "economic",
    topic: "Economic",
    prompt: "Industrial and trade policy should…",
    options: options(
      "trade",
      "Use public investment and tariffs to build domestic industry.",
      "Subsidy strategic sectors and keep trade rules.",
      "Prefer open markets with narrow security limits.",
      "Cut tariffs and subsidies and let markets allocate.",
    ),
  },
  {
    id: "spending",
    axis: "economic",
    topic: "Economic",
    prompt: "The federal budget should…",
    options: options(
      "spending",
      "Spend more on social insurance, even with higher deficits.",
      "Spend more, paid for with taxes.",
      "Hold spending and start closing the deficit.",
      "Cut domestic spending sharply.",
    ),
  },
  {
    id: "abortion",
    axis: "social",
    topic: "Social",
    prompt: "Abortion law should…",
    options: options(
      "abortion",
      "Protect access nationwide.",
      "Protect access with limited late-pregnancy rules.",
      "Return most rules to the states.",
      "Restrict abortion nationwide.",
    ),
  },
  {
    id: "civil-rights",
    axis: "social",
    topic: "Social",
    prompt: "LGBTQ civil-rights statutes should…",
    options: options(
      "civil-rights",
      "Expand in employment, housing, and public life.",
      "Stay in force and be enforced.",
      "Add broader religious exemptions.",
      "Narrow, and leave more to private association.",
    ),
  },
  {
    id: "immigration",
    axis: "social",
    topic: "Social",
    prompt: "Immigration policy should…",
    options: options(
      "immigration",
      "Expand legal immigration and a path to citizenship.",
      "Pair a path to status with some enforcement.",
      "Prioritize enforcement and a smaller legal flow.",
      "Cut legal immigration and step up removal.",
    ),
  },
  {
    id: "safety",
    axis: "social",
    topic: "Social",
    prompt: "Criminal justice should…",
    options: options(
      "safety",
      "Shift resources toward prevention and shorter sentences.",
      "Keep policing and reduce the harshest sentences.",
      "Raise penalties for violent crime.",
      "Lengthen sentences and expand policing.",
    ),
  },
  {
    id: "religion",
    axis: "social",
    topic: "Social",
    prompt: "Religion and public institutions should…",
    options: options(
      "religion",
      "Stay strictly separate.",
      "Allow private exercise with a secular state.",
      "Permit broader religious exemptions.",
      "Reflect traditional religion in public defaults.",
    ),
  },
  {
    id: "speech",
    axis: "social",
    topic: "Social",
    prompt: "Speech and public culture should…",
    options: options(
      "speech",
      "Stay broadly open, including uncomfortable speech.",
      "Stay open, with narrow harassment limits.",
      "Accept more limits on public indecency and disorder.",
      "Set traditional standards in schools and public media.",
    ),
  },
];

export function coordinateFromAnswers(answers: number[]): AxisPoint {
  if (answers.length !== DIAGNOSTIC_QUESTIONS.length) {
    throw new Error("Answer all 12 questions.");
  }
  const economic: number[] = [];
  const social: number[] = [];
  answers.forEach((score, index) => {
    if (!Number.isFinite(score) || score < -1 || score > 1) {
      throw new Error("Each answer needs a score from −1 to 1.");
    }
    const question = DIAGNOSTIC_QUESTIONS[index];
    if (question.axis === "economic") economic.push(score);
    else social.push(score);
  });
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    x: clampAxis(mean(economic)),
    y: clampAxis(mean(social)),
  };
}
