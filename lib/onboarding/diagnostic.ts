/** Eight-question onboarding tree. Four economic items set X. Four governance items set Y. */

export const MATCH_CONFIDENCE_START = 0.68;
export const MATCH_CONFIDENCE_CEILING = 0.92;
export const DIAGNOSTIC_LENGTH = 8;

export type DiagnosticAxis = "x" | "y";

export type DiagnosticChoice = {
  id: string;
  label: string;
  score: number;
};

export type DiagnosticNode = {
  id: string;
  axis: DiagnosticAxis;
  prompt: string;
  choices: readonly DiagnosticChoice[];
};

export type DiagnosticAnswer = {
  id: string;
  axis: DiagnosticAxis;
  choiceId: string;
  score: number;
};

function choices(prefix: string, labels: readonly [string, string, string, string]): readonly DiagnosticChoice[] {
  const scores = [-1, -0.45, 0.45, 1] as const;
  const ids = ["left", "lean-left", "lean-right", "right"] as const;
  return labels.map((label, index) => ({
    id: `${prefix}-${ids[index]}`,
    label,
    score: scores[index],
  }));
}

const NODES: Record<string, DiagnosticNode> = {
  "econ-1": {
    id: "econ-1",
    axis: "x",
    prompt: "Who should carry the cost of the country's largest public programs?",
    choices: choices("econ-1", [
      "A larger public role, paid for by higher taxes on high earners.",
      "More public programs, with private plans still carrying part of the cost.",
      "A thinner public role and lower taxes.",
      "Markets should carry it. Cut the taxes and programs that stand in the way.",
    ]),
  },
  "econ-public-2": {
    id: "econ-public-2",
    axis: "x",
    prompt: "How should healthcare coverage be organized?",
    choices: choices("econ-public-2", [
      "Replace private insurance with a public single-payer system.",
      "Add a public option people can buy beside private plans.",
      "Keep employer coverage and shrink the public role.",
      "Return coverage to private markets and repeal public mandates.",
    ]),
  },
  "econ-market-2": {
    id: "econ-market-2",
    axis: "x",
    prompt: "Where should the next change in federal taxes and spending land?",
    choices: choices("econ-market-2", [
      "Raise revenue and expand public programs.",
      "Hold taxes steady and protect the safety net.",
      "Cut domestic spending and keep defense.",
      "Cut taxes, domestic programs, and regulation together.",
    ]),
  },
  "econ-public-3": {
    id: "econ-public-3",
    axis: "x",
    prompt: "What should energy policy do about fossil fuels?",
    choices: choices("econ-public-3", [
      "Phase them out on a binding timeline and publicly finance the replacement.",
      "Price carbon and put public money into clean energy.",
      "Keep oil and gas while expanding nuclear and renewables.",
      "Expand drilling and roll back climate mandates.",
    ]),
  },
  "econ-market-3": {
    id: "econ-market-3",
    axis: "x",
    prompt: "What should labor law favor?",
    choices: choices("econ-market-3", [
      "Stronger unions and a higher wage floor.",
      "Easier organizing, with wages mostly set at work.",
      "Employer flexibility and a low wage floor.",
      "No federal wage floor, and tighter limits on union dues.",
    ]),
  },
  "econ-public-4": {
    id: "econ-public-4",
    axis: "x",
    prompt: "What is the right direction for wages and unions?",
    choices: choices("econ-public-4", [
      "Sectoral bargaining and a higher minimum wage.",
      "A modest wage increase and easier union elections.",
      "Leave wages to employers, with a low floor.",
      "Right-to-work rules and no federal wage floor.",
    ]),
  },
  "econ-market-4": {
    id: "econ-market-4",
    axis: "x",
    prompt: "How should regulation sit on housing, energy, and hiring?",
    choices: choices("econ-market-4", [
      "Tighter federal rules and more public investment.",
      "Keep the current rulebook and fund public gaps.",
      "Peel back permits and let firms move faster.",
      "A broad rollback of federal economic regulation.",
    ]),
  },
  "gov-1": {
    id: "gov-1",
    axis: "y",
    prompt: "How should the law treat private life?",
    choices: choices("gov-1", [
      "Protect reproductive rights and broad civil liberties.",
      "Protect privacy, with narrow public-safety exceptions.",
      "Let states write most rules about private conduct.",
      "Write traditional limits on private conduct into law.",
    ]),
  },
  "gov-liberty-2": {
    id: "gov-liberty-2",
    axis: "y",
    prompt: "What should immigration law do?",
    choices: choices("gov-liberty-2", [
      "Expand legal immigration and open a path to citizenship.",
      "Keep current levels and a limited path for long-term residents.",
      "Cut legal immigration and raise enforcement.",
      "Sharp cuts and large-scale deportations.",
    ]),
  },
  "gov-order-2": {
    id: "gov-order-2",
    axis: "y",
    prompt: "How should public order be enforced?",
    choices: choices("gov-order-2", [
      "Fewer penalties for nonviolent conduct and shorter sentences.",
      "Keep current sentences and add oversight.",
      "Hire more police and lengthen sentences.",
      "Mandatory minimums and broader police discretion.",
    ]),
  },
  "gov-liberty-3": {
    id: "gov-liberty-3",
    axis: "y",
    prompt: "How should policing and sentencing change?",
    choices: choices("gov-liberty-3", [
      "Fewer arrests for nonviolent conduct and shorter sentences.",
      "Narrow reforms, and keep current police powers.",
      "More police funding and longer sentences.",
      "Mandatory minimums and fewer limits on police.",
    ]),
  },
  "gov-order-3": {
    id: "gov-order-3",
    axis: "y",
    prompt: "Where should the border and legal immigration land?",
    choices: choices("gov-order-3", [
      "Expand legal immigration and a citizenship path.",
      "Hold immigration levels about where they are.",
      "Cut legal immigration and increase removals.",
      "Close most new migration and fund mass deportation.",
    ]),
  },
  "gov-liberty-4": {
    id: "gov-liberty-4",
    axis: "y",
    prompt: "What is the right posture for American force overseas?",
    choices: choices("gov-liberty-4", [
      "Fewer bases, and diplomacy before force.",
      "Keep alliances and avoid new wars.",
      "Raise defense spending and forward deployments.",
      "Use unilateral force when leaders judge it necessary.",
    ]),
  },
  "gov-order-4": {
    id: "gov-order-4",
    axis: "y",
    prompt: "How should public institutions handle contested social questions?",
    choices: choices("gov-order-4", [
      "Federal civil-rights rules that expand protections.",
      "Local choice, with a federal floor against discrimination.",
      "Leave the contested questions to states and parents.",
      "National rules that favor traditional norms.",
    ]),
  },
};

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(-1, value)) * 10000) / 10000;
}

function lean(answers: DiagnosticAnswer[], axis: DiagnosticAxis) {
  const scores = answers.filter((answer) => answer.axis === axis).map((answer) => answer.score);
  if (scores.length === 0) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

/** Next prompt in the tree. Later questions follow the sign of the axis so far. */
export function nextDiagnosticQuestion(answers: DiagnosticAnswer[]): DiagnosticNode | null {
  const step = answers.length;
  if (step >= DIAGNOSTIC_LENGTH) return null;
  if (step === 0) return NODES["econ-1"];
  if (step < 4) {
    const branch = lean(answers, "x") < 0 ? "public" : "market";
    return NODES[`econ-${branch}-${step + 1}`];
  }
  if (step === 4) return NODES["gov-1"];
  const branch = lean(answers, "y") < 0 ? "liberty" : "order";
  return NODES[`gov-${branch}-${step - 3}`];
}

export function replayDiagnostic(answers: DiagnosticAnswer[]): DiagnosticAnswer[] | null {
  const accepted: DiagnosticAnswer[] = [];
  for (const answer of answers) {
    const node = nextDiagnosticQuestion(accepted);
    if (!node || node.id !== answer.id || node.axis !== answer.axis) return null;
    const choice = node.choices.find((item) => item.id === answer.choiceId);
    if (!choice || choice.score !== answer.score) return null;
    accepted.push({
      id: node.id,
      axis: node.axis,
      choiceId: choice.id,
      score: choice.score,
    });
  }
  return accepted;
}

export function diagnosticCoordinate(answers: DiagnosticAnswer[]) {
  const accepted = replayDiagnostic(answers);
  if (!accepted || accepted.length !== DIAGNOSTIC_LENGTH) return null;
  const axis = (name: DiagnosticAxis) => {
    const scores = accepted.filter((answer) => answer.axis === name).map((answer) => answer.score);
    return clamp(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  };
  return { x: axis("x"), y: axis("y") };
}

/** Quadrant title for the result card. Negative X is economic left. Negative Y is more personal liberty. */
export function factionTitle(point: { x: number; y: number }) {
  const economicLeft = point.x < 0;
  const liberty = point.y < 0;
  if (economicLeft && liberty) return "Progressive";
  if (economicLeft) return "Populist";
  if (liberty) return "Libertarian";
  return "Traditionalist";
}

/** Onboarding starts at 68%. Townhall calibration walks confidence toward the ceiling. */
export function matchConfidence(calibrationAnswers: number, calibrationGoal = DIAGNOSTIC_LENGTH) {
  const ratio = Math.min(1, Math.max(0, calibrationAnswers / calibrationGoal));
  const value =
    MATCH_CONFIDENCE_START + (MATCH_CONFIDENCE_CEILING - MATCH_CONFIDENCE_START) * ratio;
  return Math.round(value * 100) / 100;
}

export function confidencePercent(score: number) {
  if (!Number.isFinite(score)) return Math.round(MATCH_CONFIDENCE_START * 100);
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}
