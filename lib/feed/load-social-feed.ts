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
  type OcdTrackDebate,
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
  /** Permanent physical ballot. Blue Cards. */
  homeOcdIds: string[];
  /** Ideological matches. Red Cards. */
  matchedOcdIds: string[];
  ideologyVector: unknown;
  tier2OcdIds: string[];
  targetDistrictId: string | null;
  districtId: string | null;
  districtName: string | null;
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

export function socialFeedQueryFromSearch(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const raw = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const trimmed = raw?.trim() ?? "";
  return trimmed || undefined;
}

function ilikeContains(value: string) {
  return `%${value.replace(/[%_\\]/g, "\\$&")}%`;
}

export async function loadFeedViewer(): Promise<FeedViewer> {
  const empty: FeedViewer = {
    userId: null,
    tier: "unverified",
    ocdIdentifiers: [],
    homeOcdIds: [],
    matchedOcdIds: [],
    ideologyVector: null,
    tier2OcdIds: [],
    targetDistrictId: null,
    districtId: null,
    districtName: null,
  };

  const supabase = await createServerSupabase();
  const user = await getServerUser();
  if (!user?.id) return empty;

  const profileSelect =
    "verification_tier, ocd_identifiers, home_ocd_ids, matched_ocd_ids, ideology_vector, target_district_id";
  const [{ data: profile, error: profileError }, { data: tier2, error: tier2Error }] =
    await Promise.all([
      supabase.from("users").select(profileSelect).eq("id", user.id).maybeSingle(),
      supabase.from("tier2_verifications").select("ocd_ids").eq("user_id", user.id).maybeSingle(),
    ]);

  const profileRow =
    profileError && /home_ocd_ids|matched_ocd_ids/i.test(profileError.message)
      ? (
          await supabase
            .from("users")
            .select("verification_tier, ocd_identifiers, ideology_vector, target_district_id")
            .eq("id", user.id)
            .maybeSingle()
        ).data
      : profile;

  const row = profileRow as {
    verification_tier?: string;
    ocd_identifiers?: unknown;
    home_ocd_ids?: unknown;
    matched_ocd_ids?: unknown;
    ideology_vector?: unknown;
    target_district_id?: string | null;
  } | null;

  const districtId = row?.target_district_id ?? null;
  let districtName: string | null = null;
  if (districtId) {
    const { data: district } = await supabase
      .from("districts")
      .select("name")
      .eq("id", districtId)
      .maybeSingle();
    const name = (district as { name?: string | null } | null)?.name?.trim();
    districtName = name ? name : null;
  }

  return {
    userId: user.id,
    tier: parseVerificationTier(row?.verification_tier),
    ocdIdentifiers: asOcdArray(row?.ocd_identifiers),
    homeOcdIds: asOcdArray(row?.home_ocd_ids),
    matchedOcdIds: asOcdArray(row?.matched_ocd_ids),
    ideologyVector: row?.ideology_vector ?? null,
    tier2OcdIds: tier2Error ? [] : asOcdArray(tier2?.ocd_ids),
    targetDistrictId: districtId,
    districtId,
    districtName,
  };
}

async function loadElections(districtId: string | null) {
  const supabase = await createServerSupabase();

  const selectElections = (columns: string, filterDistrict: boolean) => {
    let query = supabase.from("elections").select(columns);
    if (filterDistrict && districtId) query = query.eq("district_id", districtId);
    return query;
  };

  const full = await selectElections(ELECTION_COLUMNS, true);
  if (!full.error) return (full.data ?? []) as unknown as ElectionRow[];

  const withDistrict = await selectElections("id, slug, office_name, district_id, ocd_id", true);
  if (!withDistrict.error) return (withDistrict.data ?? []) as unknown as ElectionRow[];

  if (!isMissingRelation(full.error)) {
    const basic = await selectElections(ELECTION_COLUMNS_BASIC, false);
    if (!basic.error) return (basic.data ?? []) as unknown as ElectionRow[];
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
 * Question ids the viewer already debates, as candidate A or B.
 * Status is ignored so waiting, active, and completed threads all drop out.
 */
async function loadParticipatedQuestionIds(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from("debates")
    .select("election_question_id")
    .or(`candidate_a_id.eq.${userId},candidate_b_id.eq.${userId}`);

  if (error) {
    if (isMissingRelation(error)) return { ids: [], error: null };
    return { ids: [], error: error.message };
  }

  const ids = [
    ...new Set(
      ((data ?? []) as { election_question_id: string | null }[])
        .map((row) => row.election_question_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  return { ids, error: null };
}

/**
 * Red loop, candidate mode.
 * Unanswered questions whose parent election clears the two-stage viability gate,
 * or is the district filed on the profile. Questions the viewer already sits in
 * — waiting, active, or completed — stay out of the feed. Highest information gain first.
 */
export async function loadCandidateQuestions(
  viewer: FeedViewer,
  limit: number,
  queryText?: string,
): Promise<LoopQueryResult<RedFeedQuestion>> {
  const empty: LoopQueryResult<RedFeedQuestion> = { items: [], hasMore: false, error: null };
  if (!viewer.userId) return empty;

  const supabase = await createServerSupabase();
  const elections = await loadElections(viewer.districtId);
  const viableIds = await electionIdsForQuestions(supabase, viewer, elections);
  if (viableIds.length === 0) return empty;

  const [{ data: stanceRows, error: stanceError }, participated] = await Promise.all([
    supabase.from("user_stances").select("question_id").eq("user_id", viewer.userId),
    loadParticipatedQuestionIds(supabase, viewer.userId),
  ]);

  // A missing stance log means nothing has been answered yet. It must not
  // hide questions that have never been debated.
  if (stanceError && !isMissingRelation(stanceError)) {
    return { ...empty, error: stanceError.message };
  }
  if (participated.error) return { ...empty, error: participated.error };

  const answered = stanceError
    ? []
    : ((stanceRows ?? []) as { question_id: string }[])
        .map((row) => row.question_id)
        .filter(Boolean);

  const excluded = [...new Set([...answered, ...participated.ids])];

  let query = supabase
    .from("election_questions")
    .select(
      "id, prompt, election_id, jurisdictional_level, primary_axis, information_gain_score, created_at",
    )
    .in("election_id", viableIds)
    .order("information_gain_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  const pattern = queryText ? ilikeContains(queryText) : null;
  if (pattern) {
    query = query.ilike("prompt", pattern);
  }

  if (excluded.length > 0) {
    query = query.not("id", "in", `(${excluded.join(",")})`);
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
  queryText?: string,
): Promise<LoopQueryResult<BlueFeedDebate>> {
  const empty: LoopQueryResult<BlueFeedDebate> = { items: [], hasMore: false, error: null };
  if (!viewer.userId || viewer.tier2OcdIds.length === 0) return empty;

  const supabase = await createServerSupabase();
  const elections = await loadElections(viewer.districtId);
  const wanted = new Set(viewer.tier2OcdIds.map((id) => normalizeOcdId(id)));
  const matched = elections.filter((row) => wanted.has(normalizeOcdId(row.ocd_id)));
  if (matched.length === 0) return empty;

  let debates = supabase
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

  if (viewer.districtId) {
    debates = debates.eq("district_id", viewer.districtId);
  }

  const pattern = queryText ? ilikeContains(queryText) : null;
  if (pattern) {
    debates = debates.ilike("topic", pattern);
  }

  const { data, error } = await debates;

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

const LIVE_DEBATE_STATUSES = ["waiting", "matching", "active", "voting"] as const;

function policyTextOf(debate: DebateWithCandidates) {
  return [debate.topic, debate.candidate_a_argument, debate.candidate_b_argument]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Debates whose election or district OCD-ID sits in the given set.
 * Blue uses home_ocd_ids. Red uses matched_ocd_ids.
 */
async function loadDebatesForOcdIds(
  viewer: FeedViewer,
  ocdIds: string[],
  loop: OcdTrackDebate["loop"],
  limit: number,
  queryText?: string,
): Promise<LoopQueryResult<OcdTrackDebate>> {
  const empty: LoopQueryResult<OcdTrackDebate> = { items: [], hasMore: false, error: null };
  if (!viewer.userId || ocdIds.length === 0) return empty;

  const wanted = new Set(ocdIds.map((id) => normalizeOcdId(id)).filter(Boolean));
  if (wanted.size === 0) return empty;

  const supabase = await createServerSupabase();
  const [{ data: electionRows, error: electionError }, { data: districtRows, error: districtError }] =
    await Promise.all([
      supabase.from("elections").select("id, slug, office_name, ocd_id, district_id"),
      supabase.from("districts").select("id, name, ocd_id"),
    ]);

  if (electionError && !isMissingRelation(electionError)) {
    return { ...empty, error: electionError.message };
  }
  if (districtError && !isMissingRelation(districtError)) {
    return { ...empty, error: districtError.message };
  }

  const elections = ((electionRows ?? []) as ElectionRow[]).filter((row) =>
    wanted.has(normalizeOcdId(row.ocd_id)),
  );
  const districts = (
    (districtRows ?? []) as { id: string; name?: string | null; ocd_id?: string | null }[]
  ).filter((row) => wanted.has(normalizeOcdId(row.ocd_id)));

  const electionIds = elections.map((row) => row.id);
  const districtIds = districts.map((row) => row.id);
  if (electionIds.length === 0 && districtIds.length === 0) return empty;

  let debates = supabase
    .from("debates")
    .select(
      `
      *,
      candidate_a:users!debates_candidate_a_id_fkey ( id, username ),
      candidate_b:users!debates_candidate_b_id_fkey ( id, username )
    `,
    )
    .in("status", [...LIVE_DEBATE_STATUSES])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (electionIds.length > 0 && districtIds.length > 0) {
    debates = debates.or(
      `election_id.in.(${electionIds.join(",")}),district_id.in.(${districtIds.join(",")})`,
    );
  } else if (electionIds.length > 0) {
    debates = debates.in("election_id", electionIds);
  } else {
    debates = debates.in("district_id", districtIds);
  }

  const pattern = queryText ? ilikeContains(queryText) : null;
  if (pattern) debates = debates.ilike("topic", pattern);

  const { data, error } = await debates;
  if (error) {
    if (isMissingRelation(error)) return empty;
    return { ...empty, error: error.message };
  }

  const electionById = new Map(elections.map((row) => [row.id, row]));
  const districtById = new Map(districts.map((row) => [row.id, row]));
  const items: OcdTrackDebate[] = [];

  for (const debate of (data ?? []) as DebateWithCandidates[]) {
    const election = debate.election_id ? electionById.get(debate.election_id) : undefined;
    const district = debate.district_id ? districtById.get(debate.district_id) : undefined;
    const candidateA = unwrapCandidate(debate.candidate_a);
    const candidateB = unwrapCandidate(debate.candidate_b);
    items.push({
      loop,
      track: loop === "blue" ? "backyard" : "arena",
      id: debate.id,
      createdAt: debate.created_at,
      title: debate.topic,
      policyText: policyTextOf(debate),
      status: debate.status,
      districtName: election?.office_name ?? district?.name ?? "Open race",
      electionSlug: election?.slug ?? null,
      candidateA,
      candidateB,
      votingOpen: Boolean(candidateA && candidateB),
    });
  }

  return { items, hasMore: items.length === limit, error: null };
}

/** Blue Cards. Debates on the user's permanent physical ballot. */
export function loadHomeDebates(viewer: FeedViewer, limit: number, queryText?: string) {
  return loadDebatesForOcdIds(viewer, viewer.homeOcdIds, "blue", limit, queryText);
}

/** Red Cards. Debates in districts the ideological sort has matched. */
export function loadMatchedDebates(viewer: FeedViewer, limit: number, queryText?: string) {
  return loadDebatesForOcdIds(viewer, viewer.matchedOcdIds, "red", limit, queryText);
}

/** Debates in matched districts where this user sat as a candidate. Null when the count cannot be read. */
export async function answeredRedDebateCount(viewer: FeedViewer): Promise<number | null> {
  if (!viewer.userId) return null;
  if (viewer.matchedOcdIds.length === 0) return 0;

  const supabase = await createServerSupabase();
  const { data: elections, error: electionError } = await supabase
    .from("elections")
    .select("id, ocd_id");

  if (electionError) {
    if (isMissingRelation(electionError)) return 0;
    return null;
  }

  const wanted = new Set(viewer.matchedOcdIds.map((id) => normalizeOcdId(id)));
  const electionIds = ((elections ?? []) as { id: string; ocd_id?: string | null }[])
    .filter((row) => wanted.has(normalizeOcdId(row.ocd_id)))
    .map((row) => row.id);

  if (electionIds.length === 0) return 0;

  const { count, error } = await supabase
    .from("debates")
    .select("id", { count: "exact", head: true })
    .in("election_id", electionIds)
    .or(`candidate_a_id.eq.${viewer.userId},candidate_b_id.eq.${viewer.userId}`);

  if (error) {
    if (isMissingRelation(error)) return 0;
    return null;
  }

  return count ?? 0;
}
