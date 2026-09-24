import { cache } from "react";
import { DEFAULT_ELO, parseElo } from "@/lib/arena/elo";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { unlockConditionLabel } from "@/lib/escrow";
import { ANONYMOUS_DONOR, parseAmount } from "@/lib/pledges";
import type {
  CampaignPledge,
  Debate,
  DebateEvaluation,
  District,
  UserProfile,
} from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

type PledgeRow = Pick<
  CampaignPledge,
  | "id"
  | "amount"
  | "donor_id"
  | "election_id"
  | "unlock_condition"
  | "stripe_setup_intent_id"
  | "status"
  | "created_at"
>;

export type WarRoomMetrics = {
  escrowTotal: number;
  escrowCount: number;
  eloRating: number;
  eloLocked: boolean;
  evaluationCount: number;
  lockedMatchCount: number;
};

export type EscrowRow = {
  id: string;
  donorAlias: string;
  amount: number;
  debateCondition: string;
  setupIntentId: string;
  createdAt: string;
};

export type WarRoomData = {
  metrics: WarRoomMetrics;
  escrow: EscrowRow[];
};

function emptyMetrics(): WarRoomMetrics {
  return {
    escrowTotal: 0,
    escrowCount: 0,
    eloRating: DEFAULT_ELO,
    eloLocked: false,
    evaluationCount: 0,
    lockedMatchCount: 0,
  };
}

function donorAlias(username: string | null | undefined, donorId: string) {
  const trimmed = username?.trim();
  if (trimmed) return trimmed;
  return `${ANONYMOUS_DONOR} ${donorId.slice(0, 6)}`;
}

function debateCondition(
  districtName: string | null | undefined,
  debateTopic: string | null | undefined,
) {
  const seat = districtName?.trim() || "the matched seat";
  const topic = debateTopic?.trim();
  if (topic) {
    return `Win “${topic}” to unlock this vault. Filing for ${seat} captures the card.`;
  }
  return `File for ballot access in ${seat} to capture this SetupIntent.`;
}

function tryAdminClient(): AdminClient | null {
  try {
    return createAdminClient();
  } catch (caught) {
    if (
      caught instanceof Error &&
      /SUPABASE_SERVICE_ROLE_KEY/i.test(caught.message)
    ) {
      return null;
    }
    throw caught;
  }
}

async function loadEvaluationsAndElo(userId: string) {
  const supabase = await createServerSupabase();
  const [evaluationsQuery, profileQuery] = await Promise.all([
    supabase
      .from("debate_evaluations")
      .select("status, confidence_score, updated_at")
      .eq("candidate_id", userId)
      .order("updated_at", { ascending: false }),
    supabase.from("users").select("elo_rating").eq("id", userId).maybeSingle(),
  ]);

  let evaluations: Pick<
    DebateEvaluation,
    "status" | "confidence_score" | "updated_at"
  >[] = [];

  if (evaluationsQuery.error) {
    if (!isMissingRelation(evaluationsQuery.error)) {
      throw new Error(evaluationsQuery.error.message);
    }
  } else {
    evaluations = (evaluationsQuery.data ?? []) as Pick<
      DebateEvaluation,
      "status" | "confidence_score" | "updated_at"
    >[];
  }

  if (profileQuery.error) {
    throw new Error(profileQuery.error.message);
  }

  const locked = evaluations.filter((row) => row.status === "locked");
  const profile = profileQuery.data as Pick<UserProfile, "elo_rating"> | null;

  return {
    eloRating: parseElo(profile?.elo_rating) || DEFAULT_ELO,
    eloLocked: locked.length > 0,
    evaluationCount: evaluations.length,
    lockedMatchCount: locked.length,
  };
}

async function loadUncapturedPledges(userId: string): Promise<EscrowRow[]> {
  const admin = tryAdminClient();
  if (!admin) return [];

  let { data, error } = await admin
    .from("campaign_pledges")
    .select(
      "id, amount, donor_id, election_id, unlock_condition, stripe_setup_intent_id, status, created_at",
    )
    .eq("candidate_id", userId)
    .eq("status", "pending")
    .not("stripe_setup_intent_id", "is", null)
    .order("created_at", { ascending: false });

  if (error && /unlock_condition/i.test(error.message ?? "")) {
    const fallback = await admin
      .from("campaign_pledges")
      .select(
        "id, amount, donor_id, election_id, stripe_setup_intent_id, status, created_at",
      )
      .eq("candidate_id", userId)
      .eq("status", "pending")
      .not("stripe_setup_intent_id", "is", null)
      .order("created_at", { ascending: false });
    data = (fallback.data ?? []).map((row) => ({
      ...row,
      unlock_condition: null,
    }));
    error = fallback.error;
  }

  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(error.message);
  }

  const pledges = ((data ?? []) as PledgeRow[]).filter(
    (row) => Boolean(row.stripe_setup_intent_id),
  );
  if (pledges.length === 0) return [];

  const electionIds = [...new Set(pledges.map((row) => row.election_id))];
  const donorIds = [...new Set(pledges.map((row) => row.donor_id))];

  const [districtsQuery, donorsQuery, debatesQuery] = await Promise.all([
    admin.from("districts").select("id, name").in("id", electionIds),
    admin.from("users").select("id, username").in("id", donorIds),
    admin
      .from("debates")
      .select("id, topic, district_id, status, created_at")
      .or(`candidate_a_id.eq.${userId},candidate_b_id.eq.${userId}`)
      .in("district_id", electionIds)
      .order("created_at", { ascending: false }),
  ]);

  if (districtsQuery.error) throw new Error(districtsQuery.error.message);
  if (donorsQuery.error) throw new Error(donorsQuery.error.message);
  if (debatesQuery.error) throw new Error(debatesQuery.error.message);

  const districtById = new Map(
    ((districtsQuery.data ?? []) as Pick<District, "id" | "name">[]).map(
      (row) => [row.id, row.name] as const,
    ),
  );
  const usernameById = new Map(
    ((donorsQuery.data ?? []) as Pick<UserProfile, "id" | "username">[]).map(
      (row) => [row.id, row.username] as const,
    ),
  );

  const debateByDistrict = new Map<string, string>();
  for (const debate of (debatesQuery.data ?? []) as Pick<
    Debate,
    "topic" | "district_id" | "status"
  >[]) {
    if (!debate.district_id || debateByDistrict.has(debate.district_id)) continue;
    debateByDistrict.set(debate.district_id, debate.topic);
  }

  return pledges.map((row) => ({
    id: row.id,
    donorAlias: donorAlias(usernameById.get(row.donor_id), row.donor_id),
    amount: parseAmount(row.amount),
    debateCondition:
      unlockConditionLabel(row.unlock_condition) ??
      debateCondition(
        districtById.get(row.election_id),
        debateByDistrict.get(row.election_id),
      ),
    setupIntentId: row.stripe_setup_intent_id ?? "",
    createdAt: row.created_at,
  }));
}

export const loadWarRoom = cache(async (userId: string): Promise<WarRoomData> => {
  const [elo, escrow] = await Promise.all([
    loadEvaluationsAndElo(userId),
    loadUncapturedPledges(userId),
  ]);

  return {
    metrics: {
      ...emptyMetrics(),
      ...elo,
      escrowTotal: escrow.reduce((sum, row) => sum + row.amount, 0),
      escrowCount: escrow.length,
    },
    escrow,
  };
});
