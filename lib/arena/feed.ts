import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { unwrapCandidate } from "@/lib/arena/display";
import { parseElo } from "@/lib/arena/elo";
import { isMissingRelation } from "@/lib/coalitions";
import { hasStanceVector } from "@/lib/ideology/stance";
import { cosineSimilarity, parseVector, similarityToPercent } from "@/lib/ideology/vector";
import type {
  ArenaFeedCandidate,
  ArenaFeedDebate,
  ArenaFeedResult,
} from "@/lib/arena/feed-types";
import type {
  Debate,
  DebateCandidate,
  DebateEvaluation,
  DebateStatus,
  DebateWithCandidates,
} from "@/types/database.types";

export type { ArenaFeedCandidate, ArenaFeedDebate, ArenaFeedResult };

export const ACTIVE_ARENA_STATUSES: DebateStatus[] = ["matching", "active", "voting"];

type VectorKind = "stance" | "ideology";

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

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toCandidate(value: DebateWithCandidates["candidate_a"]): ArenaFeedCandidate | null {
  const raw = unwrapCandidate(value) as CandidateJoin | null;
  if (!raw) return null;
  return {
    id: raw.id,
    username: raw.username,
    elo_rating: parseElo(raw.elo_rating),
  };
}

function candidateVector(row: CandidateJoin | null): { kind: VectorKind; value: number[] } | null {
  if (!row) return null;
  const stance = parseVector(row.stance_vector);
  if (hasStanceVector(stance)) return { kind: "stance", value: stance };
  const ideology = parseVector(row.ideology_vector);
  if (ideology.length) return { kind: "ideology", value: ideology };
  return null;
}

function debateMatchScore(
  candidateA: CandidateJoin | null,
  candidateB: CandidateJoin | null,
  viewer: { kind: VectorKind; value: number[] } | null,
) {
  const vectorA = candidateVector(candidateA);
  const vectorB = candidateVector(candidateB);

  if (viewer) {
    const scores: number[] = [];
    if (vectorA?.kind === viewer.kind) {
      scores.push(cosineSimilarity(viewer.value, vectorA.value));
    }
    if (vectorB?.kind === viewer.kind) {
      scores.push(cosineSimilarity(viewer.value, vectorB.value));
    }
    return scores.length ? Math.max(...scores) : 0;
  }

  if (vectorA && vectorB && vectorA.kind === vectorB.kind) {
    return cosineSimilarity(vectorA.value, vectorB.value);
  }
  return 0;
}

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

const FULL_SELECT = `
  *,
  candidate_a:users!debates_candidate_a_id_fkey ( id, username, elo_rating, stance_vector, ideology_vector ),
  candidate_b:users!debates_candidate_b_id_fkey ( id, username, elo_rating, stance_vector, ideology_vector ),
  district:districts ( id, name ),
  evaluations:debate_evaluations ( * )
`;

const WITHOUT_EVALUATIONS_SELECT = `
  *,
  candidate_a:users!debates_candidate_a_id_fkey ( id, username, elo_rating, stance_vector, ideology_vector ),
  candidate_b:users!debates_candidate_b_id_fkey ( id, username, elo_rating, stance_vector, ideology_vector ),
  district:districts ( id, name )
`;

const MINIMAL_SELECT = `
  *,
  candidate_a:users!debates_candidate_a_id_fkey ( id, username, elo_rating ),
  candidate_b:users!debates_candidate_b_id_fkey ( id, username, elo_rating )
`;

export async function loadArenaFeed(): Promise<ArenaFeedResult> {
  const supabase = await createSupabase();

  let query = await supabase
    .from("debates")
    .select(FULL_SELECT)
    .in("status", ACTIVE_ARENA_STATUSES)
    .order("created_at", { ascending: false });

  if (query.error) {
    query = await supabase
      .from("debates")
      .select(WITHOUT_EVALUATIONS_SELECT)
      .in("status", ACTIVE_ARENA_STATUSES)
      .order("created_at", { ascending: false });
  }

  if (query.error) {
    query = await supabase
      .from("debates")
      .select(MINIMAL_SELECT)
      .in("status", ACTIVE_ARENA_STATUSES)
      .order("created_at", { ascending: false });
  }

  if (query.error) {
    if (isMissingRelation(query.error)) {
      return { debates: [], error: "The debates table is not available yet." };
    }
    return { debates: [], error: query.error.message };
  }

  const rows = (query.data ?? []) as DebateQueryRow[];
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let viewer: { kind: VectorKind; value: number[] } | null = null;
  if (user?.id) {
    const { data: profile } = await supabase
      .from("users")
      .select("stance_vector, ideology_vector")
      .eq("id", user.id)
      .maybeSingle();
    viewer = candidateVector((profile as CandidateJoin | null) ?? { id: user.id, username: "" });
  }

  const debateIds = rows.map((row) => row.id);
  let evaluationsByDebate = new Map<string, DebateEvaluation[]>();
  const nestedMissing = rows.some(
    (row) => row.evaluations == null && row.debate_evaluations == null,
  );

  if (nestedMissing && debateIds.length) {
    const { data: evaluationRows, error: evaluationError } = await supabase
      .from("debate_evaluations")
      .select("*")
      .in("debate_id", debateIds);
    if (!evaluationError) {
      evaluationsByDebate = new Map();
      for (const row of (evaluationRows ?? []) as DebateEvaluation[]) {
        const current = evaluationsByDebate.get(row.debate_id) ?? [];
        current.push(row);
        evaluationsByDebate.set(row.debate_id, current);
      }
    }
  }

  const ranked = rows
    .map((row) => {
      const candidateAJoin = unwrapOne(row.candidate_a);
      const candidateBJoin = unwrapOne(row.candidate_b);
      const district = unwrapOne(row.district);
      const nestedEvaluations = row.evaluations ?? row.debate_evaluations ?? [];
      const evaluations =
        nestedEvaluations.length > 0
          ? nestedEvaluations
          : (evaluationsByDebate.get(row.id) ?? []);
      const matchScore = debateMatchScore(candidateAJoin, candidateBJoin, viewer);
      const seated = Boolean(candidateAJoin && candidateBJoin);

      return {
        debate: {
          id: row.id,
          topic: row.topic,
          status: row.status,
          current_round: row.current_round,
          expires_at: row.expires_at,
          created_at: row.created_at,
          districtId: district?.id ?? row.district_id,
          districtName: district?.name ?? null,
          matchPercent: matchScore > 0 ? similarityToPercent(matchScore) : null,
          candidateA: toCandidate(row.candidate_a),
          candidateB: toCandidate(row.candidate_b),
          evaluations,
        } satisfies ArenaFeedDebate,
        seated,
        matchScore,
        createdAt: Date.parse(row.created_at) || 0,
      };
    })
    .sort((left, right) => {
      if (left.seated !== right.seated) return left.seated ? -1 : 1;
      if (right.matchScore !== left.matchScore) return right.matchScore - left.matchScore;
      return right.createdAt - left.createdAt;
    })
    .map((entry) => entry.debate);

  return { debates: ranked, error: null };
}
