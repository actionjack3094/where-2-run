import type { CandidateTierName } from "@/lib/platform/scoring";

const POLICY_MAX = 3;
const POLICY_LENGTH = 180;
const MANIFESTO_MIN = 20;
const MANIFESTO_MAX = 4000;

export function canPublishPlatform(tier: CandidateTierName) {
  return tier === "declared_candidate" || tier === "frontrunner";
}

export function canRecruitVolunteers(tier: CandidateTierName) {
  return tier === "frontrunner";
}

export function normalizeManifesto(value: string) {
  const manifesto = value.trim();
  if (manifesto.length < MANIFESTO_MIN || manifesto.length > MANIFESTO_MAX) {
    throw new Error("The manifesto needs a short paragraph, up to 4,000 characters.");
  }
  return manifesto;
}

export function normalizeKeyPolicies(values: string[]) {
  const policies = values.map((value) => value.trim()).filter(Boolean);
  if (policies.length < 1 || policies.length > POLICY_MAX) {
    throw new Error("Add between 1 and 3 key policy pillars.");
  }
  if (policies.some((policy) => policy.length > POLICY_LENGTH)) {
    throw new Error("Each policy pillar needs to stay under 180 characters.");
  }
  return policies;
}
