import { unwrapCandidate } from "@/lib/arena/display";
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
  DebateWithCandidates,
  VerificationTier,
} from "@/types/database.types";

const ACTIVE_DEBATE_STATUSES = ["matching", "active", "voting"] as const;
const DEFAULT_DISTRICT_NAME = "Austin City Council - District 9";

type CivicPostRow = Pick<
  CivicPost,
  "id" | "claim" | "argument" | "status" | "district_id" | "created_at" | "author_id"
>;

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
    calibration,
  };

  const supabase = await createServerSupabase();
  const user = await getServerUser();

  let viewerTier: VerificationTier = "unverified";
  if (user?.id) {
    const { data: profile } = await supabase
      .from("users")
      .select("verification_tier")
      .eq("id", user.id)
      .maybeSingle();
    viewerTier = parseVerificationTier(
      (profile as { verification_tier?: string } | null)?.verification_tier,
    );
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
      return { ...empty, viewerTier, error: "The civic feed tables are not available yet." };
    }
    return { ...empty, viewerTier, error: message };
  }

  const elections =
    electionError && isMissingRelation(electionError)
      ? []
      : ((electionRows ?? []) as ElectionLinkRow[]);

  const debates = (debateError ? [] : (debateRows ?? [])) as DebateWithCandidates[];
  const civicPosts = (civicError ? [] : (civicRows ?? [])) as CivicPostRow[];

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
    calibration: buildCalibrationPrompt(trendingTopic),
  };
}
