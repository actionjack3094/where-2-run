"use server";

import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { toNumber, unwrapDistrict } from "@/lib/electability";
import { parseAmount } from "@/lib/pledges";
import type {
  District,
  ElectabilityScore,
  ElectionRequirement,
} from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

type ScoreRow = ElectabilityScore & {
  districts: District | District[] | null;
};

export type RoadmapTimers = {
  userId: string;
  electionId: string;
  raceName: string;
  state: string;
  office: string;
  districtLevel: string | null;
  residencyDeadline: string | null;
  filingDeadline: string | null;
  residencyDaysRemaining: number | null;
  filingDaysRemaining: number | null;
  escrowPledged: number;
  escrowGoal: number;
  matchPercent: number | null;
  electability: number | null;
};

function daysRemaining(iso: string | null | undefined, now = new Date()) {
  if (!iso) return null;
  const deadline = new Date(iso);
  if (!Number.isFinite(deadline.getTime())) return null;
  return Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
}

async function loadTopMatch(
  admin: AdminClient,
  userId: string,
): Promise<{
  district: District | null;
  score: ElectabilityScore | null;
}> {
  const { data: scoreRows, error: scoreError } = await admin
    .from("electability_scores")
    .select("*, districts(*)")
    .eq("user_id", userId)
    .order("electability_multiplier", { ascending: false })
    .order("ideological_match_pct", { ascending: false })
    .limit(1);

  if (scoreError && !isMissingRelation(scoreError)) {
    throw new Error(scoreError.message);
  }

  const top = ((scoreRows ?? []) as ScoreRow[])[0] ?? null;
  const fromScore = unwrapDistrict(top?.districts);
  if (fromScore) {
    return { district: fromScore, score: top };
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("target_district_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);

  const targetDistrictId = (profile as { target_district_id: string | null } | null)
    ?.target_district_id;
  if (!targetDistrictId) {
    return { district: null, score: top };
  }

  const { data: district, error: districtError } = await admin
    .from("districts")
    .select("*")
    .eq("id", targetDistrictId)
    .maybeSingle();

  if (districtError) throw new Error(districtError.message);
  return { district: (district as District | null) ?? null, score: top };
}

async function loadRequirements(
  admin: AdminClient,
  district: District,
): Promise<ElectionRequirement | null> {
  const { data: byElection, error: electionError } = await admin
    .from("election_requirements")
    .select("*")
    .eq("election_id", district.id)
    .maybeSingle();

  if (electionError) {
    if (isMissingRelation(electionError)) return null;
    throw new Error(electionError.message);
  }
  if (byElection) return byElection as ElectionRequirement;

  if (!district.state) return null;

  const { data: byState, error: stateError } = await admin
    .from("election_requirements")
    .select("*")
    .eq("state", district.state)
    .order("filing_deadline", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (stateError) {
    if (isMissingRelation(stateError)) return null;
    throw new Error(stateError.message);
  }

  return (byState as ElectionRequirement | null) ?? null;
}

async function loadEscrowPledged(admin: AdminClient, userId: string, fallback: number) {
  const { data, error } = await admin
    .from("pledges")
    .select("amount")
    .eq("candidate_id", userId);

  if (error) {
    if (isMissingRelation(error)) return fallback;
    throw new Error(error.message);
  }

  return ((data ?? []) as { amount: number | string }[]).reduce(
    (sum, row) => sum + parseAmount(row.amount),
    0,
  );
}

export async function getRoadmapTimers(userId: string): Promise<RoadmapTimers | null> {
  const trimmed = userId.trim();
  if (!trimmed) return null;

  const admin = createAdminClient();
  const { district, score } = await loadTopMatch(admin, trimmed);
  if (!district) return null;

  const requirements = await loadRequirements(admin, district);
  const escrowFallback = toNumber(score?.total_escrow_pledged);
  const escrowPledged = await loadEscrowPledged(admin, trimmed, escrowFallback);
  const residencyDeadline = requirements?.residency_deadline ?? null;
  const filingDeadline = requirements?.filing_deadline ?? null;

  return {
    userId: trimmed,
    electionId: district.id,
    raceName: district.name,
    state: requirements?.state || district.state || "—",
    office: requirements?.office || district.name,
    districtLevel: district.level,
    residencyDeadline,
    filingDeadline,
    residencyDaysRemaining: daysRemaining(residencyDeadline),
    filingDaysRemaining: daysRemaining(filingDeadline),
    escrowPledged,
    escrowGoal: toNumber(requirements?.escrow_goal),
    matchPercent: score ? toNumber(score.ideological_match_pct) : null,
    electability: score ? toNumber(score.electability_multiplier) : null,
  };
}
