import { unwrapCandidate } from "@/lib/arena/display";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import { createServerSupabase, getServerUser } from "@/lib/db/supabase-server";
import {
  isJurisdictionalLevel,
  isPrimaryAxis,
} from "@/lib/debates/prompt-classification";
import { calculateDraftViability } from "@/lib/math/viability";
import {
  applyWaitingFloors,
  passesViabilityGate,
  type BlueFeedDebate,
  type RedFeedQuestion,
} from "@/lib/feed/types";
import { parseVerificationTier } from "@/lib/verification";
import type { DebateWithCandidates, VerificationTier } from "@/types/database.types";

const JURY_DEBATE_STATUSES = ["active", "voting"] as const;
const ELECTION_COLUMNS =
  "id, slug, office_name, district_id, ocd_id, pvi_score, primary_rep_vector, primary_dem_vector, general_vector, median_voter_vector";
const ELECTION_COLUMNS_BASIC = "id, slug, office_name, ocd_id";

export type FeedViewer = {
  userId: string | null;
  tier: VerificationTier;
  ocdIdentifiers: string[];
  ideologyVector: unknown;
  tier2OcdIds: string[];
  targetDistrictId: string | null;
};

type ElectionRow = {
  id: string;
  slug: string;
  office_name: string;
  district_id?: string | null;
  ocd_id?: string | null;
  pvi_score?: number | null;
  primary_rep_vector?: unknown;
  primary_dem_vector?: unknown;
  general_vector?: unknown;
  median_voter_vector?: unknown;
};

type QuestionRow = {
  id: string;
  prompt: string;
  election_id: string;
  jurisdictional_level: string;
  primary_axis: string;
  information_gain_score: number | string | null;
  created_at: string;
};

export type LoopQueryResult<T> = {
  items: T[];
  hasMore: boolean;
  error: string | null;
};

function asOcdArray(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return asOcdArray(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function asScore(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 100);
}

export function socialFeedPageFromSearch(
  searchParams: Record<string, string | string[] | undefined>,
) {
  return parsePage(searchParams.page);
}

export async function loadFeedViewer(): Promise<FeedViewer> {
  const empty: FeedViewer = {
    userId: null,
    tier: "unverified",
    ocdIdentifiers: [],
    ideologyVector: null,
    tier2OcdIds: [],
    targetDistrictId: null,
  };

  const supabase = await createServerSupabase();
  const user = await getServerUser();
  if (!user?.id) return empty;

  const [{ data: profile }, { data: tier2, error: tier2Error }] = await Promise.all([
    supabase
      .from("users")
      .select("verification_tier, ocd_identifiers, ideology_vector, target_district_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("tier2_verifications").select("ocd_ids").eq("user_id", user.id).maybeSingle(),
  ]);

  const row = profile as {
    verification_tier?: string;
    ocd_identifiers?: unknown;
    ideology_vector?: unknown;
    target_district_id?: string | null;
  } | null;

  return {
    userId: user.id,
    tier: parseVerificationTier(row?.verification_tier),
    ocdIdentifiers: asOcdArray(row?.ocd_identifiers),
    ideologyVector: row?.ideology_vector ?? null,
    tier2OcdIds: tier2Error ? [] : asOcdArray(tier2?.ocd_ids),
    targetDistrictId: row?.target_district_id ?? null,
  };
}

async function loadElections() {
  const supabase = await createServerSupabase();
  const full = await supabase.from("elections").select(ELECTION_COLUMNS);
  if (!full.error) return (full.data ?? []) as ElectionRow[];

  const withDistrict = await supabase
    .from("elections")
    .select("id, slug, office_name, district_id, ocd_id");
  if (!withDistrict.error) return (withDistrict.data ?? []) as ElectionRow[];

  if (!isMissingRelation(full.error)) {
    const basic = await supabase.from("elections").select(ELECTION_COLUMNS_BASIC);
    if (!basic.error) return (basic.data ?? []) as ElectionRow[];
  }
  return [] as ElectionRow[];
}

function viableElectionIds(viewer: FeedViewer, elections: ElectionRow[]) {
  const ids: string[] = [];
  for (const election of elections) {
    const funnel = calculateDraftViability({
      ideologyVector: viewer.ideologyVector,
      primaryRepVector: election.primary_rep_vector,
      primaryDemVector: election.primary_dem_vector,
      generalVector: election.general_vector ?? election.median_voter_vector,
      pviScore: election.pvi_score,
    });
    if (passesViabilityGate(funnel.viability)) ids.push(election.id);
  }
  return ids;
}

/** Viable races, plus the seat the runner just filed on their profile. */
function questionElectionIds(viewer: FeedViewer, elections: ElectionRow[]) {
  const ids = new Set(viableElectionIds(viewer, elections));
  if (viewer.targetDistrictId) {
    for (const election of elections) {
      if (election.district_id === viewer.targetDistrictId) ids.add(election.id);
    }
  }
  return [...ids];
}

/**
 * Red loop, candidate mode.
 * Unanswered questions whose parent election clears the two-stage viability gate,
 * or is the district filed on the profile. Highest information gain first.
 */
export async function loadCandidateQuestions(
  viewer: FeedViewer,
  limit: number,
): Promise<LoopQueryResult<RedFeedQuestion>> {
  const empty: LoopQueryResult<RedFeedQuestion> = { items: [], hasMore: false, error: null };
  if (!viewer.userId) return empty;

  const supabase = await createServerSupabase();
  const elections = await loadElections();
  const viableIds = await electionIdsForQuestions(supabase, viewer, elections);
  if (viableIds.length === 0) return empty;

  const { data: stanceRows, error: stanceError } = await supabase
    .from("user_stances")
    .select("question_id")
    .eq("user_id", viewer.userId);

  // A missing stance log means nothing has been answered yet. It must not
  // hide questions that have never been debated.
  if (stanceError && !isMissingRelation(stanceError)) {
    return { ...empty, error: stanceError.message };
  }

  const answered = stanceError
    ? []
    : ((stanceRows ?? []) as { question_id: string }[])
        .map((row) => row.question_id)
        .filter(Boolean);

  let query = supabase
    .from("election_questions")
    .select(
      "id, prompt, election_id, jurisdictional_level, primary_axis, information_gain_score, created_at",
    )
    .in("election_id", viableIds)
    .order("information_gain_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (answered.length > 0) {
    query = query.not("id", "in", `(${answered.join(",")})`);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelation(error)) return empty;
    return { ...empty, error: error.message };
  }

  const byId = new Map(elections.map((row) => [row.id, row]));
  const items: RedFeedQuestion[] = [];
  for (const row of (data ?? []) as QuestionRow[]) {
    if (!isJurisdictionalLevel(row.jurisdictional_level)) continue;
    if (!isPrimaryAxis(row.primary_axis)) continue;
    const election = byId.get(row.election_id);
    items.push({
      loop: "red",
      id: row.id,
      createdAt: row.created_at,
      prompt: row.prompt,
      electionId: row.election_id,
      electionSlug: election?.slug ?? null,
      districtName: election?.office_name ?? "Open race",
      jurisdictionalLevel: row.jurisdictional_level,
      primaryAxis: row.primary_axis,
      informationGainScore: asScore(row.information_gain_score),
      waitingDebateId: null,
      waitingOpponentName: null,
      viewerHoldsFloor: false,
    });
  }

  const annotated = await attachWaitingFloors(supabase, viewer, items);

  return { items: annotated, hasMore: annotated.length === limit, error: null };
}

/** Viable races, plus every election filed on the viewer's district. */
async function electionIdsForQuestions(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  viewer: FeedViewer,
  elections: ElectionRow[],
) {
  const ids = new Set(questionElectionIds(viewer, elections));
  if (!viewer.targetDistrictId) return [...ids];

  const { data, error } = await supabase
    .from("elections")
    .select("id, slug, office_name, district_id")
    .eq("district_id", viewer.targetDistrictId);

  if (error || !data) return [...ids];

  for (const row of data as ElectionRow[]) {
    ids.add(row.id);
    if (!elections.some((election) => election.id === row.id)) elections.push(row);
  }
  return [...ids];
}

type WaitingFloorRow = {
  id: string;
  election_question_id: string | null;
  candidate_a_id: string | null;
  candidate_a: { id?: string; username?: string } | { id?: string; username?: string }[] | null;
};

function opponentName(row: WaitingFloorRow) {
  const candidate = Array.isArray(row.candidate_a) ? row.candidate_a[0] : row.candidate_a;
  const name = candidate?.username?.trim();
  return name ? name : null;
}

/**
 * Left-side lookup of waiting debates. An empty result is an open floor:
 * the question stays in the feed. This select is not embedded on
 * election_questions, so it cannot inner-join those rows away.
 */
async function attachWaitingFloors(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  viewer: FeedViewer,
  items: RedFeedQuestion[],
) {
  if (!viewer.userId || items.length === 0) return [...items];
  if (!viewer.targetDistrictId) return applyWaitingFloors(items, [], viewer.userId);

  const { data, error } = await supabase
    .from("debates")
    .select(
      `
      id,
      election_question_id,
      candidate_a_id,
      candidate_a:users!debates_candidate_a_id_fkey ( id, username )
    `,
    )
    .in(
      "election_question_id",
      items.map((item) => item.id),
    )
    .eq("district_id", viewer.targetDistrictId)
    .eq("status", "waiting")
    .is("candidate_b_id", null)
    .order("created_at", { ascending: true });

  if (error) return applyWaitingFloors(items, [], viewer.userId);

  const floors = ((data ?? []) as WaitingFloorRow[]).map((row) => ({
    id: row.id,
    electionQuestionId: row.election_question_id,
    candidateAId: row.candidate_a_id,
    opponentName: opponentName(row),
  }));

  return applyWaitingFloors(items, floors, viewer.userId);
}

/**
 * Blue loop, jury mode.
 * Active debates between other users whose election OCD-ID is in the
 * viewer's tier-2 verification set.
 */
export async function loadJuryDebates(
  viewer: FeedViewer,
  limit: number,
): Promise<LoopQueryResult<BlueFeedDebate>> {
  const empty: LoopQueryResult<BlueFeedDebate> = { items: [], hasMore: false, error: null };
  if (!viewer.userId || viewer.tier2OcdIds.length === 0) return empty;

  const supabase = await createServerSupabase();
  const elections = await loadElections();
  const wanted = new Set(viewer.tier2OcdIds.map((id) => normalizeOcdId(id)));
  const matched = elections.filter((row) => wanted.has(normalizeOcdId(row.ocd_id)));
  if (matched.length === 0) return empty;

  const { data, error } = await supabase
    .from("debates")
    .select(
      `
      *,
      candidate_a:users!debates_candidate_a_id_fkey ( id, username ),
      candidate_b:users!debates_candidate_b_id_fkey ( id, username )
    `,
    )
    .in(
      "election_id",
      matched.map((row) => row.id),
    )
    .in("status", [...JURY_DEBATE_STATUSES])
    .not("candidate_a_id", "is", null)
    .not("candidate_b_id", "is", null)
    .neq("candidate_a_id", viewer.userId)
    .neq("candidate_b_id", viewer.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelation(error)) return empty;
    return { ...empty, error: error.message };
  }

  const byId = new Map(matched.map((row) => [row.id, row]));
  const items: BlueFeedDebate[] = [];
  for (const debate of (data ?? []) as DebateWithCandidates[]) {
    if (!debate.candidate_a_id || !debate.candidate_b_id) continue;
    if (debate.candidate_a_id === viewer.userId || debate.candidate_b_id === viewer.userId) {
      continue;
    }
    const candidateA = unwrapCandidate(debate.candidate_a);
    const candidateB = unwrapCandidate(debate.candidate_b);
    const election = debate.election_id ? byId.get(debate.election_id) : undefined;
    items.push({
      loop: "blue",
      id: debate.id,
      createdAt: debate.created_at,
      title: debate.topic,
      status: debate.status,
      districtName: election?.office_name ?? "Open race",
      electionSlug: election?.slug ?? null,
      candidateA,
      candidateB,
      votingOpen: Boolean(candidateA && candidateB),
    });
  }

  return { items, hasMore: items.length === limit, error: null };
}
