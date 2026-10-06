import { matchPercentFromDistance, stanceIsStale } from "@/lib/ballot/fading";
import { rankFeedItems, type RankedFeedItem } from "@/lib/ballot/feed";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { euclidean } from "@/lib/platform/scoring";
import type { PlatformAdmin } from "@/lib/platform/records";
import type { BallotMatch } from "@/lib/platform/types";

export type SoapboxFeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  likes: number;
  createdAt: string;
  matchPercent: number | null;
  stale: boolean;
};

export type CandidateFreshness = {
  stale: boolean;
  percent: number | null;
};

export async function loadBallotDecorations(
  admin: PlatformAdmin,
  viewer: { id: string; x: number; y: number } | null,
  matches: BallotMatch[],
) {
  const candidateIds = [
    ...new Set(matches.flatMap((match) => [match.sideA.id, match.sideB.id])),
  ];
  const debateIds = matches.map((match) => match.id);
  const names = new Map<string, string>();
  for (const match of matches) {
    names.set(match.sideA.id, match.sideA.name);
    names.set(match.sideB.id, match.sideB.name);
  }

  const profiles =
    candidateIds.length === 0
      ? { data: [], error: null }
      : await admin.from("profiles").select("id, ideology_x, ideology_y").in("id", candidateIds);
  const coords = new Map<string, { x: number; y: number }>();
  if (!profiles.error) {
    for (const row of (profiles.data ?? []) as {
      id: string;
      ideology_x: number | null;
      ideology_y: number | null;
    }[]) {
      if (row.ideology_x == null || row.ideology_y == null) continue;
      coords.set(row.id, { x: row.ideology_x, y: row.ideology_y });
    }
  }

  const touched = new Map<string, string>();
  if (candidateIds.length > 0) {
    const activity = await admin
      .from("arena_debates")
      .select("candidate_a_id, candidate_b_id, updated_at")
      .or(candidateIds.map((id) => `candidate_a_id.eq.${id},candidate_b_id.eq.${id}`).join(","));
    if (!activity.error) {
      for (const row of (activity.data ?? []) as {
        candidate_a_id: string;
        candidate_b_id: string | null;
        updated_at: string;
      }[]) {
        for (const id of [row.candidate_a_id, row.candidate_b_id]) {
          if (!id) continue;
          const prior = touched.get(id);
          if (!prior || Date.parse(row.updated_at) > Date.parse(prior)) touched.set(id, row.updated_at);
        }
      }
    }
  }

  const freshness = new Map<string, CandidateFreshness>();
  for (const id of candidateIds) {
    const point = coords.get(id);
    const percent =
      viewer && point ? matchPercentFromDistance(euclidean(viewer, point)) : null;
    freshness.set(id, { stale: stanceIsStale(touched.get(id) ?? null), percent });
  }

  const likesByDebate = new Map<string, number>();
  if (debateIds.length > 0) {
    const likes = await admin.from("debate_likes").select("debate_id").in("debate_id", debateIds);
    if (!likes.error) {
      for (const row of (likes.data ?? []) as { debate_id: string }[]) {
        likesByDebate.set(row.debate_id, (likesByDebate.get(row.debate_id) ?? 0) + 1);
      }
    }
  }

  const soapbox: SoapboxFeedPost[] = [];
  if (candidateIds.length > 0) {
    const posts = await admin
      .from("soapbox_posts")
      .select("id, author_id, content, upvote_count, created_at")
      .in("author_id", candidateIds)
      .order("created_at", { ascending: false })
      .limit(40);
    if (!posts.error && !isMissingSchema(posts.error)) {
      for (const row of (posts.data ?? []) as {
        id: string;
        author_id: string;
        content: string;
        upvote_count: number | null;
        created_at: string;
      }[]) {
        const fresh = freshness.get(row.author_id);
        soapbox.push({
          id: row.id,
          authorId: row.author_id,
          authorName: names.get(row.author_id) ?? "Candidate",
          text: row.content,
          likes: row.upvote_count ?? 0,
          createdAt: row.created_at,
          matchPercent: fresh?.percent ?? null,
          stale: fresh?.stale ?? true,
        });
      }
    }
  }

  const ranked = rankFeedItems([
    ...matches.map(
      (match): RankedFeedItem => ({
        kind: "debate",
        id: match.id,
        likes: likesByDebate.get(match.id) ?? 0,
        createdAt: match.createdAt,
      }),
    ),
    ...soapbox.map(
      (post): RankedFeedItem => ({
        kind: "soapbox",
        id: post.id,
        likes: post.likes,
        createdAt: post.createdAt,
      }),
    ),
  ]);

  return { soapbox, freshness, likesByDebate, ranked };
}
