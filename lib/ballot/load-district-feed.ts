import { loadBallotDecorations, type SoapboxFeedPost } from "@/lib/ballot/load-feed";
import { districtLabelFromOcd, formatDistrictLabel } from "@/lib/ballot/district-label";
import { isOfficiallyFiled } from "@/lib/ballot/filing";
import { latestSideText } from "@/lib/debates/clash-feed";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { loadBallot } from "@/lib/platform/queries";
import {
  loadHomeOcdIds,
  loadPrimaries,
  loadProfiles,
  ocdMatches,
  platformAdmin,
  type PlatformProfile,
} from "@/lib/platform/records";
import type { BallotMatch } from "@/lib/platform/types";

export type BallotPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  filed: boolean;
  excerpt: string;
  primaryId: string;
  pledged: number;
};

export type BallotDebateCard = {
  kind: "debate";
  id: string;
  question: string;
  officeTag: string;
  href: string;
  upvotes: number;
  resonance: number;
  questionCount: number;
  priority: boolean;
  active: boolean;
  sideA: BallotPerson;
  sideB: BallotPerson;
  createdAt: string;
};

export type BallotStatementCard = {
  kind: "statement";
  id: string;
  text: string;
  officeTag: string;
  upvotes: number;
  resonance: number;
  debateHref: string | null;
  author: BallotPerson;
  createdAt: string;
};

export type BallotFeedCard = BallotDebateCard | BallotStatementCard;

export type MyBallotFeed = {
  signedOut: boolean;
  needsZip: boolean;
  districtLabel: string | null;
  cards: BallotFeedCard[];
  notice: string | null;
};

const empty = (patch: Partial<MyBallotFeed>): MyBallotFeed => ({
  signedOut: false,
  needsZip: false,
  districtLabel: null,
  cards: [],
  notice: null,
  ...patch,
});

function officeTag(office: string, state: string, district: string | null) {
  const place = formatDistrictLabel(state, district) ?? state.trim().toUpperCase();
  const short = office.replace(/\bU\.S\./g, "US").trim();
  return place ? `${short} · ${place}` : short || "Primary";
}

export async function loadMyBallotFeed(userId: string | null): Promise<MyBallotFeed> {
  if (!userId) return empty({ signedOut: true });

  try {
    const admin = platformAdmin();
    const home = await loadHomeOcdIds(admin, userId);
    if (home.length === 0) return empty({ needsZip: true });

    const primaries = (await loadPrimaries(admin)).filter((primary) => ocdMatches(home, primary.ocd_id));
    const districtLabel =
      districtLabelFromOcd(home) ??
      formatDistrictLabel(primaries[0]?.state, primaries[0]?.district) ??
      primaries[0]?.state ??
      null;

    const board = await loadBallot(userId);
    if (board.signedOut) return empty({ signedOut: true });
    if (board.needsAddress) return empty({ needsZip: true });

    const profile = await admin
      .from("profiles")
      .select("ideology_x, ideology_y, state_code, congressional_district")
      .eq("id", userId)
      .maybeSingle();
    const viewerRow = profile.error
      ? null
      : (profile.data as {
          ideology_x: number | null;
          ideology_y: number | null;
          state_code: string | null;
          congressional_district: string | null;
        } | null);
    const viewer =
      viewerRow?.ideology_x != null && viewerRow.ideology_y != null
        ? { id: userId, x: viewerRow.ideology_x, y: viewerRow.ideology_y }
        : null;
    const label =
      districtLabel ??
      formatDistrictLabel(viewerRow?.state_code, viewerRow?.congressional_district);

    const decorations = await loadBallotDecorations(admin, viewer, board.matches).catch(() => ({
      soapbox: [] as SoapboxFeedPost[],
      freshness: new Map(),
      likesByDebate: new Map<string, number>(),
      ranked: board.matches.map((match) => ({
        kind: "debate" as const,
        id: match.id,
        likes: 0,
        createdAt: match.createdAt,
      })),
    }));

    const primaryById = new Map(primaries.map((primary) => [primary.id, primary]));
    const candidateRows = primaries.length
      ? await admin.from("candidates").select("id, display_name, primary_id").in(
          "primary_id",
          primaries.map((primary) => primary.id),
        )
      : { data: [], error: null };
    const districtCandidates = (candidateRows.error ? [] : candidateRows.data ?? []) as {
      id: string;
      display_name: string | null;
      primary_id: string | null;
    }[];
    const primaryForAuthor = new Map<string, string>();
    const nameFallback = new Map<string, string>();
    for (const row of districtCandidates) {
      if (!row.primary_id || primaryForAuthor.has(row.id)) continue;
      primaryForAuthor.set(row.id, row.primary_id);
      nameFallback.set(row.id, row.display_name?.trim() || "Candidate");
    }

    const knownAuthors = new Set(decorations.soapbox.map((post) => post.authorId));
    const extraAuthorIds = [...primaryForAuthor.keys()].filter((id) => !knownAuthors.has(id));
    const extraPosts: SoapboxFeedPost[] = [];
    if (extraAuthorIds.length > 0) {
      const posts = await admin
        .from("soapbox_posts")
        .select("id, author_id, content, upvote_count, created_at")
        .in("author_id", extraAuthorIds)
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
          extraPosts.push({
            id: row.id,
            authorId: row.author_id,
            authorName: nameFallback.get(row.author_id) ?? "Candidate",
            text: row.content,
            likes: row.upvote_count ?? 0,
            createdAt: row.created_at,
            matchPercent: null,
            stale: false,
          });
        }
      }
    }

    const people = [
      ...board.matches.flatMap((match) => [match.sideA.id, match.sideB.id]),
      ...decorations.soapbox.map((post) => post.authorId),
      ...extraPosts.map((post) => post.authorId),
    ];
    const filed = await loadFiledIds(admin, people);
    const profiles = await loadProfiles(admin, people);
    const debateIds = board.matches.map((match) => match.id);
    const [questions, votes, argumentsResult, chests] = await Promise.all([
      debateIds.length
        ? admin.from("constituent_questions").select("debate_id").in("debate_id", debateIds)
        : Promise.resolve({ data: [], error: null }),
      debateIds.length
        ? admin.from("debate_votes").select("debate_id").in("debate_id", debateIds)
        : Promise.resolve({ data: [], error: null }),
      debateIds.length
        ? admin.from("arguments").select("debate_id, author_id, round_number, content").in("debate_id", debateIds)
        : Promise.resolve({ data: [], error: null }),
      people.length
        ? admin
            .from("primary_standings")
            .select("user_id, primary_id, pledged_war_chest")
            .in("user_id", [...new Set(people)])
        : Promise.resolve({ data: [], error: null }),
    ]);

    const questionCounts = countRows(questions.error ? [] : ((questions.data ?? []) as { debate_id: string }[]), "debate_id");
    const resonanceCounts = countRows(votes.error ? [] : ((votes.data ?? []) as { debate_id: string }[]), "debate_id");
    const argumentsByDebate = new Map<string, { authorId: string; round: number; content: string }[]>();
    if (!argumentsResult.error) {
      for (const row of (argumentsResult.data ?? []) as {
        debate_id: string;
        author_id: string;
        round_number: number;
        content: string;
      }[]) {
        const list = argumentsByDebate.get(row.debate_id) ?? [];
        list.push({ authorId: row.author_id, round: row.round_number, content: row.content });
        argumentsByDebate.set(row.debate_id, list);
      }
    }
    const pledged = new Map<string, number>();
    if (!chests.error) {
      for (const row of (chests.data ?? []) as {
        user_id: string;
        primary_id: string;
        pledged_war_chest: number | string | null;
      }[]) {
        pledged.set(`${row.user_id}:${row.primary_id}`, Number(row.pledged_war_chest ?? 0));
      }
    }

    const debateByPerson = new Map<string, string>();
    for (const match of board.matches) {
      if (!debateByPerson.has(match.sideA.id)) debateByPerson.set(match.sideA.id, match.id);
      if (!debateByPerson.has(match.sideB.id)) debateByPerson.set(match.sideB.id, match.id);
    }

    const person = (
      id: string,
      name: string,
      avatarUrl: string | null,
      primaryId: string,
      excerpt: string,
    ): BallotPerson => ({
      id,
      name,
      avatarUrl,
      filed: filed.has(id),
      excerpt,
      primaryId,
      pledged: pledged.get(`${id}:${primaryId}`) ?? 0,
    });

    const debateCards = new Map<string, BallotDebateCard>(
      board.matches.map((match) => {
        const primary = primaryById.get(match.primaryId);
        const filedRows = argumentsByDebate.get(match.id) ?? [];
        const card: BallotDebateCard = {
          kind: "debate",
          id: match.id,
          question: match.prompt,
          officeTag: officeTag(
            primary?.office_name ?? match.officeName,
            primary?.state ?? match.state,
            primary?.district ?? match.district,
          ),
          href: `/debates/${match.id}`,
          upvotes: decorations.likesByDebate.get(match.id) ?? 0,
          resonance: resonanceCounts.get(match.id) ?? 0,
          questionCount: questionCounts.get(match.id) ?? 0,
          priority: match.priority,
          active: match.status === "active",
          sideA: person(
            match.sideA.id,
            match.sideA.name,
            match.sideA.avatarUrl,
            match.primaryId,
            latestSideText(match.stanceA, filedRows, match.sideA.id),
          ),
          sideB: person(
            match.sideB.id,
            match.sideB.name,
            match.sideB.avatarUrl,
            match.primaryId,
            latestSideText(match.stanceB, filedRows, match.sideB.id),
          ),
          createdAt: match.createdAt,
        };
        return [match.id, card];
      }),
    );

    const statementCards = new Map<string, BallotStatementCard>();
    for (const post of [...decorations.soapbox, ...extraPosts]) {
      if (statementCards.has(post.id)) continue;
      const primaryId = primaryForAuthor.get(post.authorId) ?? debatePrimary(board.matches, post.authorId);
      if (!primaryId) continue;
      const primary = primaryById.get(primaryId);
      const profileRow = profiles.get(post.authorId);
      const debateId = debateByPerson.get(post.authorId) ?? null;
      statementCards.set(post.id, {
        kind: "statement",
        id: post.id,
        text: post.text,
        officeTag: officeTag(primary?.office_name ?? "Primary", primary?.state ?? "", primary?.district ?? null),
        upvotes: post.likes,
        resonance: 0,
        debateHref: debateId ? `/debates/${debateId}` : null,
        author: person(
          post.authorId,
          profileName(profileRow, post.authorName),
          profileRow?.avatar_url ?? null,
          primaryId,
          post.text,
        ),
        createdAt: post.createdAt,
      });
    }

    const order = [
      ...decorations.ranked.map((item) => ({ kind: item.kind, id: item.id, likes: item.likes })),
      ...extraPosts.map((post) => ({ kind: "soapbox" as const, id: post.id, likes: post.likes })),
    ];
    const seen = new Set<string>();
    const cards: BallotFeedCard[] = [];
    for (const item of order) {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      const card = item.kind === "debate" ? debateCards.get(item.id) : statementCards.get(item.id);
      if (!card) continue;
      seen.add(key);
      cards.push(card);
    }

    cards.sort((left, right) => compareCards(left, right));

    return { signedOut: false, needsZip: false, districtLabel: label, cards, notice: null };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load My Ballot.";
    return empty({
      notice: isMissingSchema({ message }) ? "Apply the platform architecture migration, then reload." : message,
    });
  }
}

function compareCards(left: BallotFeedCard, right: BallotFeedCard) {
  const priority = Number(right.kind === "debate" && right.priority) - Number(left.kind === "debate" && left.priority);
  if (priority !== 0) return priority;
  const likes = right.upvotes - left.upvotes;
  if (likes !== 0) return likes;
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

function debatePrimary(matches: BallotMatch[], authorId: string) {
  return matches.find((match) => match.sideA.id === authorId || match.sideB.id === authorId)?.primaryId ?? null;
}

function profileName(profile: PlatformProfile | undefined, fallback: string) {
  return profile?.display_name?.trim() || profile?.full_name?.trim() || fallback;
}

function countRows(rows: { debate_id: string }[], key: "debate_id") {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row[key];
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

async function loadFiledIds(admin: ReturnType<typeof platformAdmin>, ids: string[]) {
  const filed = new Set<string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return filed;

  const [targets, standings] = await Promise.all([
    admin.from("campaign_targets").select("user_id, official_candidate_id, status").in("user_id", unique),
    admin.from("primary_standings").select("user_id, is_nominee").in("user_id", unique),
  ]);

  if (!targets.error) {
    for (const row of (targets.data ?? []) as {
      user_id: string;
      official_candidate_id: string | null;
      status: string | null;
    }[]) {
      if (isOfficiallyFiled({ officialCandidateId: row.official_candidate_id, status: row.status })) {
        filed.add(row.user_id);
      }
    }
  }
  if (!standings.error) {
    for (const row of (standings.data ?? []) as { user_id: string; is_nominee: boolean | null }[]) {
      if (isOfficiallyFiled({ isNominee: row.is_nominee })) filed.add(row.user_id);
    }
  }
  return filed;
}
