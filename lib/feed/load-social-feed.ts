import { unwrapCandidate } from "@/lib/arena/display";
import { governingEvaluation, parseScore } from "@/lib/arena/evaluations";
import { readElectionOcdId } from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import { createServerSupabase, getServerUser } from "@/lib/db/supabase-server";
import {
  ELECTION_LINK_COLUMNS,
  resolveElectionLink,
  type ElectionLinkRow,
} from "@/lib/election-links";
import { buildCalibrationPrompt } from "@/lib/feed/calibration";
import {
  SOCIAL_FEED_PAGE_SIZE,
  type SocialFeedItem,
  type SocialFeedResult,
} from "@/lib/feed/types";
import { parseVerificationTier } from "@/lib/verification";
import type {
  CivicPost,
  DebateCandidate,
  DebateEvaluation,
  DebateWithCandidates,
  VerificationTier,
} from "@/types/database.types";

const ACTIVE_DEBATE_STATUSES = ["matching", "active", "voting"] as const;
const DEFAULT_DISTRICT_NAME = "Austin City Council - District 9";

type CivicPostRow = Pick<
  CivicPost,
  "id" | "claim" | "argument" | "status" | "district_id" | "created_at" | "author_id"
>;

function asOcdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function createdAtValue(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
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

export async function loadSocialFeed(page: number): Promise<SocialFeedResult> {
  const safePage = parsePage(String(page));
  const limit = safePage * SOCIAL_FEED_PAGE_SIZE;
  const calibration = buildCalibrationPrompt();
  const empty: SocialFeedResult = {
    items: [],
    page: safePage,
    pageSize: SOCIAL_FEED_PAGE_SIZE,
    hasMore: false,
    error: null,
    viewerTier: "unverified",
    viewerOcdIdentifiers: [],
    calibration,
  };

  const supabase = await createServerSupabase();
  const user = await getServerUser();

  let viewerTier: VerificationTier = "unverified";
  let viewerOcdIdentifiers: string[] = [];
  if (user?.id) {
    const { data: profile } = await supabase
      .from("users")
      .select("verification_tier, ocd_identifiers")
      .eq("id", user.id)
      .maybeSingle();
    const row = profile as {
      verification_tier?: string;
      ocd_identifiers?: unknown;
    } | null;
    viewerTier = parseVerificationTier(row?.verification_tier);
    viewerOcdIdentifiers = asOcdArray(row?.ocd_identifiers);
  }

  const [
    { data: debateRows, error: debateError },
    { data: civicRows, error: civicError },
    { data: electionRows, error: electionError },
  ] = await Promise.all([
    supabase
      .from("debates")
      .select(
        `
        *,
        candidate_a:users!debates_candidate_a_id_fkey ( id, username ),
        candidate_b:users!debates_candidate_b_id_fkey ( id, username )
      `,
      )
      .in("status", [...ACTIVE_DEBATE_STATUSES])
      .order("created_at", { ascending: false })
      .range(0, limit - 1),
    supabase
      .from("civic_posts")
      .select("id, claim, argument, status, district_id, created_at, author_id")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .range(0, limit - 1),
    supabase.from("elections").select(ELECTION_LINK_COLUMNS),
  ]);

  if (debateError && civicError) {
    const message = debateError.message || civicError.message;
    if (isMissingRelation(debateError) && isMissingRelation(civicError)) {
      return {
        ...empty,
        viewerTier,
        viewerOcdIdentifiers,
        error: "The civic feed tables are not available yet.",
      };
    }
    return { ...empty, viewerTier, viewerOcdIdentifiers, error: message };
  }

  const elections =
    electionError && isMissingRelation(electionError)
      ? []
      : ((electionRows ?? []) as ElectionLinkRow[]);

  const debates = (debateError ? [] : (debateRows ?? [])) as DebateWithCandidates[];
  const civicPosts = (civicError ? [] : (civicRows ?? [])) as CivicPostRow[];

  const debateIds = debates.map((debate) => debate.id);
  const scoreByDebate = new Map<string, number | null>();
  if (debateIds.length) {
    const { data: evaluationRows, error: evaluationError } = await supabase
      .from("debate_evaluations")
      .select("debate_id, candidate_id, confidence_score, status, ensemble_result")
      .in("debate_id", debateIds);
    if (!evaluationError) {
      const grouped = new Map<string, DebateEvaluation[]>();
      for (const row of (evaluationRows ?? []) as DebateEvaluation[]) {
        const current = grouped.get(row.debate_id) ?? [];
        current.push(row);
        grouped.set(row.debate_id, current);
      }
      for (const [debateId, rows] of grouped) {
        const governing = governingEvaluation(rows);
        scoreByDebate.set(debateId, governing ? parseScore(governing.confidence_score) : null);
      }
    }
  }

  const electionIds = [
    ...new Set(debates.map((debate) => debate.election_id).filter((id): id is string => Boolean(id))),
  ];
  const ocdByElection = new Map<string, string>();
  if (electionIds.length) {
    const { data: ocdRows, error: ocdError } = await supabase
      .from("elections")
      .select("id, ocd_id")
      .in("id", electionIds);
    if (!ocdError) {
      for (const row of (ocdRows ?? []) as { id: string; ocd_id?: string | null }[]) {
        const ocdId = row.ocd_id?.trim();
        if (ocdId) ocdByElection.set(row.id, ocdId);
      }
    }
  }

  const authorIds = [...new Set(civicPosts.map((post) => post.author_id).filter(Boolean))];
  const { data: authorRows } = authorIds.length
    ? await supabase.from("users").select("id, username").in("id", authorIds)
    : { data: [] as DebateCandidate[] };
  const authorById = new Map(
    ((authorRows ?? []) as DebateCandidate[]).map((row) => [row.id, row]),
  );

  const debateItems: SocialFeedItem[] = debates.map((debate) => {
    const candidateA = unwrapCandidate(debate.candidate_a);
    const candidateB = unwrapCandidate(debate.candidate_b);
    const election = resolveElectionLink(elections, {
      electionId: debate.election_id,
      districtId: debate.district_id,
    });
    return {
      kind: "debate",
      id: debate.id,
      createdAt: debate.created_at,
      title: debate.topic,
      status: debate.status,
      districtName: election?.officeName ?? DEFAULT_DISTRICT_NAME,
      electionSlug: election?.slug ?? null,
      candidateA,
      candidateB,
      votingOpen:
        (debate.status === "active" || debate.status === "voting") &&
        Boolean(candidateA && candidateB),
      aiScore: scoreByDebate.get(debate.id) ?? null,
      electionId: readElectionOcdId(
        debate.election_id,
        debate.election_id ? ocdByElection.get(debate.election_id) : null,
      ),
    };
  });

  const stanceItems: SocialFeedItem[] = civicPosts.map((post) => {
    const election = resolveElectionLink(elections, { districtId: post.district_id });
    return {
      kind: "stance",
      id: post.id,
      createdAt: post.created_at,
      title: post.claim,
      body: post.argument,
      status: post.status,
      districtName: election?.officeName ?? post.district_id ?? DEFAULT_DISTRICT_NAME,
      electionSlug: election?.slug ?? null,
      author: authorById.get(post.author_id) ?? null,
    };
  });

  const merged = [...debateItems, ...stanceItems].sort(
    (left, right) => createdAtValue(right.createdAt) - createdAtValue(left.createdAt),
  );
  const items = merged.slice(0, limit);
  const hasMore =
    merged.length > limit ||
    debates.length === limit ||
    civicPosts.length === limit;

  const trendingTopic = debateItems[0]?.title ?? stanceItems[0]?.title ?? null;

  return {
    items,
    page: safePage,
    pageSize: SOCIAL_FEED_PAGE_SIZE,
    hasMore,
    error: null,
    viewerTier,
    viewerOcdIdentifiers,
    calibration: buildCalibrationPrompt(trendingTopic),
  };
}
