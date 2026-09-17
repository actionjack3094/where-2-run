export type PolicyOption = {
  id: string;
  label: string;
  score: number;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: PolicyOption[];
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "climate",
    prompt: "What should the next decade of energy policy look like?",
    options: [
      {
        id: "climate-phaseout",
        label:
          "Phase out fossil fuels on a binding timeline and publicly finance a renewable build-out.",
        score: 1,
      },
      {
        id: "climate-price",
        label:
          "Price carbon, keep targeted clean-energy subsidies, and let markets choose the mix.",
        score: 0.66,
      },
      {
        id: "climate-all",
        label:
          "Pursue all-of-the-above: keep oil and gas while expanding nuclear and renewables.",
        score: 0.33,
      },
      {
        id: "climate-drill",
        label:
          "Expand domestic oil and gas production and roll back climate mandates.",
        score: 0,
      },
    ],
  },
  {
    id: "healthcare",
    prompt: "How should coverage and costs be structured?",
    options: [
      {
        id: "health-single",
        label: "Move to a public single-payer system that replaces private insurance.",
        score: 1,
      },
      {
        id: "health-option",
        label:
          "Keep private plans and add a public option people can buy into.",
        score: 0.66,
      },
      {
        id: "health-markets",
        label:
          "Preserve employer coverage, expand HSAs, and trim insurance mandates.",
        score: 0.33,
      },
      {
        id: "health-private",
        label:
          "Return healthcare to private markets and repeal ACA-style requirements.",
        score: 0,
      },
    ],
  },
  {
    id: "immigration",
    prompt: "Where should immigration and border policy land?",
    options: [
      {
        id: "imm-path",
        label:
          "Expand legal immigration and create a broad pathway to citizenship.",
        score: 1,
      },
      {
        id: "imm-mixed",
        label:
          "Legalize long-term residents, raise legal caps, and keep targeted enforcement.",
        score: 0.66,
      },
      {
        id: "imm-merit",
        label:
          "Secure the border, shift to merit-based admissions, and skip broad amnesty.",
        score: 0.33,
      },
      {
        id: "imm-deport",
        label:
          "Cut legal immigration sharply and pursue large-scale deportations.",
        score: 0,
      },
    ],
  },
  {
    id: "economy",
    prompt: "What is the right fiscal and labor stance?",
    options: [
      {
        id: "econ-tax",
        label:
          "Raise taxes on high earners and corporations, and strengthen unions.",
        score: 1,
      },
      {
        id: "econ-balance",
        label:
          "Keep progressive taxes, spend on targeted industrial policy, and protect bargaining rights.",
        score: 0.66,
      },
      {
        id: "econ-grow",
        label:
          "Cut regulation, trim taxes at the margin, and let growth do most of the work.",
        score: 0.33,
      },
      {
        id: "econ-slash",
        label:
          "Deeply cut taxes and federal spending, and unwind labor and industrial mandates.",
        score: 0,
      },
    ],
  },
  {
    id: "social",
    prompt: "How should the law treat reproductive rights and civil liberties?",
    options: [
      {
        id: "social-codify",
        label:
          "Codify abortion rights nationally and expand LGBTQ civil-rights protections.",
        score: 1,
      },
      {
        id: "social-viability",
        label:
          "Keep a viability-based abortion framework and enforce existing civil-rights statutes.",
        score: 0.66,
      },
      {
        id: "social-states",
        label:
          "Return abortion to the states and broaden religious-liberty exemptions.",
        score: 0.33,
      },
      {
        id: "social-restrict",
        label:
          "Set national abortion limits and restore traditional social-policy defaults.",
        score: 0,
      },
    ],
  },
  {
    id: "safety",
    prompt: "What is the right approach to policing and public safety?",
    options: [
      {
        id: "safety-reallocate",
        label:
          "Shift funds from patrol toward prevention, mental health, and community responders.",
        score: 1,
      },
      {
        id: "safety-accountable",
        label:
          "Keep departments fully staffed while tightening use-of-force and accountability rules.",
        score: 0.66,
      },
      {
        id: "safety-hire",
        label:
          "Hire more officers, prosecute repeat offenders, and keep reforms narrow.",
        score: 0.33,
      },
      {
        id: "safety-zero",
        label:
          "Restore zero-tolerance enforcement and expand police legal protections.",
        score: 0,
      },
    ],
  },
];

export function buildUserVector(scores: number[]): number[] {
  const climate = scores[0] ?? 0.5;
  const healthcare = scores[1] ?? 0.5;
  const immigration = scores[2] ?? 0.5;
  const economy = scores[3] ?? 0.5;
  const social = scores[4] ?? 0.5;
  const safety = scores[5] ?? 0.5;

  return [
    climate,
    social,
    1 - immigration,
    1 - safety,
    healthcare,
    social,
    1 - economy,
    1 - safety,
    (climate + economy) / 2,
    economy,
  ];
}
