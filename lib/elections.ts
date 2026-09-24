import { cache } from "react";
import { unwrapCandidate } from "@/lib/arena/display";
import { readElectionOcdId } from "@/lib/civic-fencing";
import { parseElo } from "@/lib/arena/elo";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { toNumber } from "@/lib/electability";
import {
  sixAxisMatchPercent,
  toSixAxisVector,
  type SixAxisVector,
} from "@/lib/ideology/six-axis";
import { formatRecord, recordFromStats } from "@/lib/leaderboard";
import { parseAmount } from "@/lib/pledges";
import type { ArenaFeedCandidate, ArenaFeedDebate } from "@/lib/arena/feed-types";
import type {
  CampaignPledge,
  CandidateStats,
  Debate,
  DebateCandidate,
  DebateEvaluation,
  Election,
  ElectabilityScore,
  FilingRequirements,
} from "@/types/database.types";

export type ElectionDraftCandidate = {
  id: string;
  username: string;
  wins: number;
  losses: number;
  record: string;
  eloRating: number;
  primaryMatch: number;
  vector: SixAxisVector;
};

export type ElectionEscrowPledge = {
  id: string;
  candidateId: string;
  candidateName: string;
  amount: number;
  status: string;
  createdAt: string;
};

export type ElectionHub = {
  election: Election;
  medianVector: SixAxisVector;
  debates: ArenaFeedDebate[];
  candidates: ElectionDraftCandidate[];
  pledges: ElectionEscrowPledge[];
  escrowTotal: number;
  escrowCount: number;
};

export type ElectionListItem = Pick<
  Election,
  "id" | "slug" | "office_name" | "incumbent_name" | "district_id"
> & {
  debateCount: number;
  candidateCount: number;
};

type CandidateJoin = DebateCandidate & {
  elo_rating?: number | string | null;
  stance_vector?: unknown;
  ideology_vector?: unknown;
};

type DebateQueryRow = Debate & {
  candidate_a: CandidateJoin | CandidateJoin[] | null;
  candidate_b: CandidateJoin | CandidateJoin[] | null;
  district?: { id: string; name: string } | { id: string; name: string }[] | null;
  evaluations?: DebateEvaluation[] | null;
  debate_evaluations?: DebateEvaluation[] | null;
};

type StatsRow = Pick<
  CandidateStats,
  | "id"
  | "username"
  | "debates_won"
  | "debates_played"
  | "elo_rating"
  | "ideology_vector"
  | "stance_vector"
  | "target_district_id"
>;

type ScoreRow = Pick<ElectabilityScore, "user_id" | "ideological_match_pct">;

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function parseFilingRequirements(value: unknown): FilingRequirements {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as FilingRequirements;
  }
  return {};
}

function toFeedCandidate(value: DebateWithJoin): ArenaFeedCandidate | null {
  const raw = unwrapCandidate(value) as CandidateJoin | null;
  if (!raw) return null;
  return {
    id: raw.id,
    username: raw.username,
    elo_rating: parseElo(raw.elo_rating),
  };
}

type DebateWithJoin = DebateQueryRow["candidate_a"];

function candidateSixAxis(row: {
  ideology_vector?: unknown;
  stance_vector?: unknown;
} | null): SixAxisVector {
  if (!row) return toSixAxisVector(null);
  const ideology = toSixAxisVector(row.ideology_vector);
  if (row.ideology_vector) return ideology;
  return toSixAxisVector(row.stance_vector);
}

const DEBATE_SELECT = `
  *,
  candidate_a:users!debates_candidate_a_id_fkey ( id, username, elo_rating, stance_vector, ideology_vector ),
  candidate_b:users!debates_candidate_b_id_fkey ( id, username, elo_rating, stance_vector, ideology_vector ),
  district:districts ( id, name ),
  evaluations:debate_evaluations ( * )
`;

const DEBATE_SELECT_MINIMAL = `
  *,
  candidate_a:users!debates_candidate_a_id_fkey ( id, username, elo_rating ),
  candidate_b:users!debates_candidate_b_id_fkey ( id, username, elo_rating )
`;

function mapDebateRow(row: DebateQueryRow, election: Pick<Election, "slug" | "office_name">): ArenaFeedDebate {
  const district = unwrapOne(row.district);
  const evaluations = row.evaluations ?? row.debate_evaluations ?? [];
  return {
    id: row.id,
    topic: row.topic,
    status: row.status,
    current_round: row.current_round,
    expires_at: row.expires_at,
    created_at: row.created_at,
    districtId: district?.id ?? row.district_id,
    districtName: election.office_name,
    electionSlug: election.slug,
    electionId: readElectionOcdId(row.election_id),
    matchPercent: null,
    candidateA: toFeedCandidate(row.candidate_a),
    candidateB: toFeedCandidate(row.candidate_b),
    evaluations,
  };
}

async function loadElectionDebates(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  election: Election,
) {
  let query = await supabase
    .from("debates")
    .select(DEBATE_SELECT)
    .eq("election_id", election.id)
    .order("created_at", { ascending: false });

  if (query.error && election.district_id) {
    query = await supabase
      .from("debates")
      .select(DEBATE_SELECT)
      .or(`election_id.eq.${election.id},district_id.eq.${election.district_id}`)
      .order("created_at", { ascending: false });
  }

  if (query.error && election.district_id) {
    query = await supabase
      .from("debates")
      .select(DEBATE_SELECT)
      .eq("district_id", election.district_id)
      .order("created_at", { ascending: false });
  }

  if (query.error) {
    query = await supabase
      .from("debates")
      .select(DEBATE_SELECT_MINIMAL)
      .eq("election_id", election.id)
      .order("created_at", { ascending: false });
  }

  if (query.error) {
    if (isMissingRelation(query.error)) return [];
    throw new Error(query.error.message);
  }

  return ((query.data ?? []) as DebateQueryRow[]).map((row) =>
    mapDebateRow(row, election),
  );
}

async function loadEscrowPledges(electionId: string): Promise<ElectionEscrowPledge[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("campaign_pledges")
      .select("id, candidate_id, amount, status, created_at")
      .eq("election_id", electionId)
      .in("status", ["pending", "captured"])
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingRelation(error)) return [];
      throw new Error(error.message);
    }

    const rows = (data ?? []) as Pick<
      CampaignPledge,
      "id" | "candidate_id" | "amount" | "status" | "created_at"
    >[];
    if (rows.length === 0) return [];

    const candidateIds = [...new Set(rows.map((row) => row.candidate_id))];
    const { data: users } = await admin
      .from("users")
      .select("id, username")
      .in("id", candidateIds);
    const names = new Map(
      ((users ?? []) as { id: string; username: string }[]).map((row) => [
        row.id,
        row.username,
      ]),
    );

    return rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      candidateName: names.get(row.candidate_id) ?? "Unnamed candidate",
      amount: parseAmount(row.amount),
      status: String(row.status),
      createdAt: row.created_at,
    }));
  } catch (caught) {
    if (caught instanceof Error && /SUPABASE_SERVICE_ROLE_KEY/i.test(caught.message)) {
      return [];
    }
    throw caught;
  }
}

function upsertDraftCandidate(
  byId: Map<string, ElectionDraftCandidate>,
  input: {
    id: string;
    username: string;
    wins?: number;
    losses?: number;
    eloRating?: number;
    vector?: SixAxisVector;
    primaryMatch?: number;
  },
  median: SixAxisVector,
) {
  const current = byId.get(input.id);
  const vector = input.vector ?? current?.vector ?? toSixAxisVector(null);
  const primaryMatch =
    input.primaryMatch ??
    current?.primaryMatch ??
    sixAxisMatchPercent(vector, median);
  byId.set(input.id, {
    id: input.id,
    username: input.username || current?.username || "Unnamed candidate",
    wins: input.wins ?? current?.wins ?? 0,
    losses: input.losses ?? current?.losses ?? 0,
    record: formatRecord(
      input.wins ?? current?.wins ?? 0,
      input.losses ?? current?.losses ?? 0,
    ),
    eloRating: input.eloRating ?? current?.eloRating ?? parseElo(null),
    primaryMatch,
    vector,
  });
}

async function loadDraftCandidates(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  election: Election,
  debates: ArenaFeedDebate[],
  median: SixAxisVector,
): Promise<ElectionDraftCandidate[]> {
  const byId = new Map<string, ElectionDraftCandidate>();

  for (const debate of debates) {
    for (const candidate of [debate.candidateA, debate.candidateB]) {
      if (!candidate) continue;
      upsertDraftCandidate(
        byId,
        {
          id: candidate.id,
          username: candidate.username,
          eloRating: candidate.elo_rating,
        },
        median,
      );
    }
  }

  const districtId = election.district_id;
  if (districtId) {
    const [statsQuery, scoresQuery] = await Promise.all([
      supabase
        .from("candidate_stats")
        .select(
          "id, username, debates_won, debates_played, elo_rating, ideology_vector, stance_vector, target_district_id",
        )
        .eq("target_district_id", districtId),
      supabase
        .from("electability_scores")
        .select("user_id, ideological_match_pct")
        .eq("district_id", districtId),
    ]);

    if (statsQuery.error && !isMissingRelation(statsQuery.error)) {
      throw new Error(statsQuery.error.message);
    }
    if (scoresQuery.error && !isMissingRelation(scoresQuery.error)) {
      throw new Error(scoresQuery.error.message);
    }

    const matchByUser = new Map(
      ((scoresQuery.data ?? []) as ScoreRow[]).map((row) => [
        row.user_id,
        Math.round(toNumber(row.ideological_match_pct)),
      ]),
    );

    for (const row of (statsQuery.data ?? []) as StatsRow[]) {
      const record = recordFromStats(row);
      const vector = candidateSixAxis(row);
      upsertDraftCandidate(
        byId,
        {
          id: row.id,
          username: row.username,
          wins: record.wins,
          losses: record.losses,
          eloRating: parseElo(row.elo_rating),
          vector,
          primaryMatch: matchByUser.get(row.id) ?? sixAxisMatchPercent(vector, median),
        },
        median,
      );
    }

    const missingIds = [...matchByUser.keys()].filter((id) => !byId.has(id));
    if (missingIds.length > 0) {
      const { data: users, error } = await supabase
        .from("users")
        .select("id, username, elo_rating, ideology_vector, stance_vector")
        .in("id", missingIds);
      if (error && !isMissingRelation(error)) throw new Error(error.message);
      for (const row of (users ?? []) as StatsRow[]) {
        const vector = candidateSixAxis(row);
        upsertDraftCandidate(
          byId,
          {
            id: row.id,
            username: row.username,
            eloRating: parseElo(row.elo_rating),
            vector,
            primaryMatch: matchByUser.get(row.id) ?? sixAxisMatchPercent(vector, median),
          },
          median,
        );
      }
    }
  }

  return [...byId.values()].sort((left, right) => {
    if (right.eloRating !== left.eloRating) return right.eloRating - left.eloRating;
    if (right.primaryMatch !== left.primaryMatch) {
      return right.primaryMatch - left.primaryMatch;
    }
    if (right.wins !== left.wins) return right.wins - left.wins;
    return left.username.localeCompare(right.username);
  });
}

export const loadElectionHub = cache(async (
  slug: string,
): Promise<{ hub: ElectionHub | null; error: string | null }> => {
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed) return { hub: null, error: null };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("elections")
    .select("*")
    .eq("slug", trimmed)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) {
      return { hub: null, error: "The elections table is not available yet." };
    }
    return { hub: null, error: error.message };
  }
  if (!data) return { hub: null, error: null };

  const election = {
    ...(data as Election),
    filing_requirements: parseFilingRequirements(
      (data as Election).filing_requirements,
    ),
  };
  const medianVector = toSixAxisVector(election.median_voter_vector);

  try {
    const [debates, pledges] = await Promise.all([
      loadElectionDebates(supabase, election),
      loadEscrowPledges(election.id),
    ]);
    const candidates = await loadDraftCandidates(
      supabase,
      election,
      debates,
      medianVector,
    );

    return {
      hub: {
        election,
        medianVector,
        debates,
        candidates,
        pledges,
        escrowTotal: pledges.reduce((sum, row) => sum + row.amount, 0),
        escrowCount: pledges.length,
      },
      error: null,
    };
  } catch (caught) {
    return {
      hub: null,
      error: caught instanceof Error ? caught.message : "Could not load this election.",
    };
  }
});

export const loadElectionDirectory = cache(async (): Promise<{
  elections: ElectionListItem[];
  error: string | null;
}> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("elections")
    .select("id, slug, office_name, incumbent_name, district_id")
    .order("office_name");

  if (error) {
    if (isMissingRelation(error)) {
      return { elections: [], error: "The elections table is not available yet." };
    }
    return { elections: [], error: error.message };
  }

  const rows = (data ?? []) as ElectionListItem[];
  if (rows.length === 0) return { elections: [], error: null };

  const ids = rows.map((row) => row.id);
  const districtIds = rows
    .map((row) => row.district_id)
    .filter((id): id is string => Boolean(id));

  const [debatesQuery, statsQuery] = await Promise.all([
    supabase.from("debates").select("id, election_id").in("election_id", ids),
    districtIds.length
      ? supabase
          .from("candidate_stats")
          .select("id, target_district_id")
          .in("target_district_id", districtIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const debateCounts = new Map<string, number>();
  for (const row of (debatesQuery.data ?? []) as { election_id: string | null }[]) {
    if (!row.election_id) continue;
    debateCounts.set(row.election_id, (debateCounts.get(row.election_id) ?? 0) + 1);
  }

  const candidateCounts = new Map<string, number>();
  for (const row of (statsQuery.data ?? []) as {
    target_district_id: string | null;
  }[]) {
    if (!row.target_district_id) continue;
    candidateCounts.set(
      row.target_district_id,
      (candidateCounts.get(row.target_district_id) ?? 0) + 1,
    );
  }

  return {
    elections: rows.map((row) => ({
      ...row,
      debateCount: debateCounts.get(row.id) ?? 0,
      candidateCount: row.district_id
        ? (candidateCounts.get(row.district_id) ?? 0)
        : 0,
    })),
    error: null,
  };
});
