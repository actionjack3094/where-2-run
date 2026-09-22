import { CORE_POLICY_PROMPTS } from "@/lib/ideology/onboarding";
import { parseVector } from "@/lib/ideology/vector";

export const SIX_AXIS_DIMENSIONS = 6;

export const SIX_AXIS_IDS = [
  "climate",
  "healthcare",
  "immigration",
  "economy",
  "social",
  "safety",
] as const;

export type SixAxisId = (typeof SIX_AXIS_IDS)[number];

export type SixAxisVector = [
  number,
  number,
  number,
  number,
  number,
  number,
];

export const SIX_AXIS_LABELS: Record<SixAxisId, string> = {
  climate: "Energy & Climate",
  healthcare: "Healthcare",
  immigration: "Immigration",
  economy: "Economy & Labor",
  social: "Civil Rights",
  safety: "Public Safety",
};

export const SIX_AXIS_POLES: Record<SixAxisId, { low: string; high: string }> = {
  climate: { low: "Fossil expansion", high: "Public renewables" },
  healthcare: { low: "Private markets", high: "Single-payer" },
  immigration: { low: "Restriction", high: "Pathway / expansion" },
  economy: { low: "Tax cuts / deregulation", high: "Labor & progressive tax" },
  social: { low: "Traditional defaults", high: "Codified civil rights" },
  safety: { low: "Zero-tolerance patrol", high: "Prevention / responders" },
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function signedToUnit(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0 || value > 1) return clamp01((value + 1) / 2);
  return clamp01(value);
}

export function emptySixAxis(): SixAxisVector {
  return [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
}

export function toSixAxisVector(value: unknown): SixAxisVector {
  const raw = parseVector(value);
  if (raw.length === 0) return emptySixAxis();

  const signed = raw.some((entry) => entry < 0);

  if (raw.length === 6) {
    return [
      signedToUnit(raw[0] ?? 0.5),
      signedToUnit(raw[1] ?? 0.5),
      signedToUnit(raw[2] ?? 0.5),
      signedToUnit(raw[3] ?? 0.5),
      signedToUnit(raw[4] ?? 0.5),
      signedToUnit(raw[5] ?? 0.5),
    ];
  }

  if (raw.length >= 10 && signed) {
    return [
      signedToUnit(raw[5] ?? 0),
      signedToUnit(raw[4] ?? 0),
      signedToUnit(raw[6] ?? 0),
      signedToUnit(raw[0] ?? 0),
      signedToUnit(raw[8] ?? 0),
      clamp01(1 - signedToUnit(raw[9] ?? 0)),
    ];
  }

  if (raw.length >= 10) {
    return [
      clamp01(raw[0] ?? 0.5),
      clamp01(raw[4] ?? 0.5),
      clamp01(1 - (raw[2] ?? 0.5)),
      clamp01(raw[9] ?? 0.5),
      clamp01(raw[1] ?? 0.5),
      clamp01(1 - (raw[3] ?? 0.5)),
    ];
  }

  return [
    signedToUnit(raw[0] ?? 0.5),
    signedToUnit(raw[4] ?? raw[1] ?? 0.5),
    signedToUnit(raw[2] ?? 0.5),
    signedToUnit(raw[3] ?? raw[0] ?? 0.5),
    signedToUnit(raw[1] ?? 0.5),
    signedToUnit(raw[5] ?? raw[2] ?? 0.5),
  ];
}

export function sixAxisEntries(vector: SixAxisVector) {
  return SIX_AXIS_IDS.map((id, index) => ({
    id,
    index,
    label: SIX_AXIS_LABELS[id],
    poles: SIX_AXIS_POLES[id],
    prompt: CORE_POLICY_PROMPTS[index]?.prompt ?? "",
    value: vector[index],
  }));
}

export function cosineSixAxis(a: SixAxisVector, b: SixAxisVector) {
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < SIX_AXIS_DIMENSIONS; i += 1) {
    dot += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (denominator === 0) return 0;
  return dot / denominator;
}

export function sixAxisMatchPercent(a: SixAxisVector, b: SixAxisVector) {
  return Math.round(clamp01(cosineSixAxis(a, b)) * 100);
}

export function formatSixAxisVector(vector: SixAxisVector) {
  return `[${vector.map((value) => value.toFixed(6)).join(",")}]`;
}
