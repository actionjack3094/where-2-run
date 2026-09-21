import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { cache } from "react";
import { unwrapCandidate, isUuid } from "@/lib/arena/display";
import { DEFAULT_ELO, parseElo } from "@/lib/arena/elo";
import {
  confidenceThresholdCopy,
  parseScore,
  type ConfidenceBand,
} from "@/lib/arena/evaluations";
import {
  formatVerifiedDistrict,
  isMissingCivicColumn,
} from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { parseAmount } from "@/lib/pledges";
import type {
  CampaignPledge,
  DebateEvaluation,
  DebateWithCandidates,
  District,
  UserProfile,
} from "@/types/database.types";

const PROFILE_COLUMNS =
  "id, username, elo_rating, verification_tier, is_verified, target_district_id, ocd_identifiers, tier_2_verified";
const PROFILE_COLUMNS_FALLBACK =
  "id, username, elo_rating, verification_tier, is_verified, target_district_id";

type ProfileRow = Pick<
  UserProfile,
  | "id"
  | "username"
  | "elo_rating"
  | "verification_tier"
  | "is_verified"
  | "target_district_id"
> & {
  ocd_identifiers?: string[] | null;
  tier_2_verified?: boolean | null;
};

export type CandidateArenaMatch = {
  debateId: string;
  topic: string;
  status: string;
  opponentName: string | null;
  occurredAt: string;
  confidenceScore: number | null;
  primaryScore: number | null;
  evaluationStatus: string | null;
  ensembleResult: boolean | null;
  verdictLabel: string;
  verdictBand: ConfidenceBand;
  verdictDetail: string;
};

export type PublicCandidateProfile = {
  id: string;
  username: string;
  verificationTier: string;
  isVerified: boolean;
  eloRating: number;
  eloLocked: boolean;
  lockedMatchCount: number;
  ocdDistrict: string | null;
  ocdVerified: boolean;
  targetDistrictId: string | null;
  targetDistrictName: string | null;
  escrowTotal: number;
  escrowCount: number;
  matches: CandidateArenaMatch[];
};

async function createSupabase() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot persist refreshed auth cookies.
        }
      },
    },
  });
}

function asOcdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
  );
}

function verdictFor(evaluation: DebateEvaluation | null) {
  const threshold = confidenceThresholdCopy(
    evaluation?.confidence_score,
    Boolean(evaluation),
  );

  if (evaluation?.status === "locked") {
    const court = evaluation.ensemble_result == null
      ? "ELO sealed"
      : evaluation.ensemble_result
        ? "Ensemble pass · ELO locked"
        : "Ensemble fail · ELO locked";
    return {
      ...threshold,
      label: `${threshold.label} · ${court}`,
    };
  }

  return threshold;
}

async function loadEscrowTotals(candidateId: string) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("campaign_pledges")
      .select("amount, stripe_setup_intent_id, status")
      .eq("candidate_id", candidateId)
      .eq("status", "pending");

    if (error) {
      if (isMissingRelation(error)) return { total: 0, count: 0 };
      throw new Error(error.message);
    }

    const active = ((data ?? []) as Pick<
      CampaignPledge,
      "amount" | "stripe_setup_intent_id" | "status"
    >[]).filter((row) => Boolean(row.stripe_setup_intent_id));

    return {
      total: active.reduce((sum, row) => sum + parseAmount(row.amount), 0),
      count: active.length,
    };
  } catch (caught) {
    if (caught instanceof Error && /SUPABASE_SERVICE_ROLE_KEY/i.test(caught.message)) {
      return { total: 0, count: 0 };
    }
    throw caught;
  }
}

export const loadPublicCandidate = cache(async (
  id: string,
): Promise<{ profile: PublicCandidateProfile | null; error: string | null }> => {
  if (!isUuid(id)) {
    return { profile: null, error: null };
  }

  const supabase = await createSupabase();
  const primary = await supabase
    .from("users")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  const fallback =
    primary.error && isMissingCivicColumn(primary.error)
      ? await supabase
          .from("users")
          .select(PROFILE_COLUMNS_FALLBACK)
          .eq("id", id)
          .maybeSingle()
      : null;

  const userError = fallback ? fallback.error : primary.error;
  const userRow = ((fallback ? fallback.data : primary.data) as ProfileRow | null) ?? null;

  if (userError) {
    return { profile: null, error: userError.message };
  }
  if (!userRow) {
    return { profile: null, error: null };
  }

  const [{ data: districtRow, error: districtError }, evaluationsQuery, debatesQuery, escrow] =
    await Promise.all([
      userRow.target_district_id
        ? supabase
            .from("districts")
            .select("id, name")
            .eq("id", userRow.target_district_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("debate_evaluations")
        .select("*")
        .eq("candidate_id", id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("debates")
        .select(
          `
          *,
          candidate_a:users!debates_candidate_a_id_fkey ( id, username ),
          candidate_b:users!debates_candidate_b_id_fkey ( id, username )
        `,
        )
        .or(`candidate_a_id.eq.${id},candidate_b_id.eq.${id}`)
        .in("status", ["completed", "expired"])
        .order("expires_at", { ascending: false }),
      loadEscrowTotals(id),
    ]);

  if (districtError) {
    return { profile: null, error: districtError.message };
  }

  let evaluations: DebateEvaluation[] = [];
  if (evaluationsQuery.error) {
    if (!isMissingRelation(evaluationsQuery.error)) {
      return { profile: null, error: evaluationsQuery.error.message };
    }
  } else {
    evaluations = (evaluationsQuery.data ?? []) as DebateEvaluation[];
  }

  if (debatesQuery.error) {
    return { profile: null, error: debatesQuery.error.message };
  }

  const lockedEvaluations = evaluations.filter((row) => row.status === "locked");
  const evaluationByDebate = new Map(
    evaluations.map((row) => [row.debate_id, row] as const),
  );

  const matches: CandidateArenaMatch[] = (
    (debatesQuery.data ?? []) as DebateWithCandidates[]
  ).map((debate) => {
    const evaluation = evaluationByDebate.get(debate.id) ?? null;
    const opponent =
      debate.candidate_a_id === id
        ? unwrapCandidate(debate.candidate_b)
        : unwrapCandidate(debate.candidate_a);
    const verdict = verdictFor(evaluation);

    return {
      debateId: debate.id,
      topic: debate.topic,
      status: debate.status,
      opponentName: opponent?.username ?? null,
      occurredAt: debate.expires_at || debate.created_at,
      confidenceScore: evaluation ? parseScore(evaluation.confidence_score) : null,
      primaryScore: evaluation ? parseScore(evaluation.primary_score) : null,
      evaluationStatus: evaluation?.status ?? null,
      ensembleResult: evaluation?.ensemble_result ?? null,
      verdictLabel: verdict.label,
      verdictBand: verdict.band,
      verdictDetail: verdict.detail,
    };
  });

  const filedDistrict = (districtRow as Pick<District, "id" | "name"> | null) ?? null;
  const ocdDistrict = formatVerifiedDistrict(asOcdArray(userRow.ocd_identifiers));

  return {
    profile: {
      id: userRow.id,
      username: userRow.username,
      verificationTier: String(userRow.verification_tier ?? "unverified"),
      isVerified: Boolean(userRow.is_verified),
      eloRating: parseElo(userRow.elo_rating) || DEFAULT_ELO,
      eloLocked: lockedEvaluations.length > 0,
      lockedMatchCount: lockedEvaluations.length,
      ocdDistrict,
      ocdVerified: Boolean(userRow.tier_2_verified) && Boolean(ocdDistrict),
      targetDistrictId: userRow.target_district_id,
      targetDistrictName: filedDistrict?.name ?? null,
      escrowTotal: escrow.total,
      escrowCount: escrow.count,
      matches,
    },
    error: null,
  };
});
