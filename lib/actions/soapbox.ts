"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/arena/display";
import { requireActionUserId } from "@/lib/arena/auth";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { BANNED_ARENA_MESSAGE } from "@/lib/platform/moderation";
import { primaryClosed } from "@/lib/platform/cycle";
import {
  displayName,
  loadHomeOcdIds,
  loadPrimaries,
  loadProfile,
  loadProfiles,
  ocdMatches,
  platformAdmin,
  type PlatformAdmin,
  type PlatformProfile,
} from "@/lib/platform/records";
import { partyFromCoordinate, type Party } from "@/lib/platform/scoring";
import { partyLabel } from "@/lib/platform/types";
import type { Primary } from "@/types/database.types";

const SPEECH_MAX = 280;
const STANCE_MIN = 20;
const STANCE_MAX = 500;
const ACCEPTANCE_MS = 24 * 60 * 60 * 1000;
const MIGRATION_MESSAGE = "Apply the Soapbox migration, then reload.";

export type SoapboxPostView = {
  id: string;
  authorId: string;
  content: string;
  tags: string[];
  createdAt: string;
  name: string;
  legalName: string | null;
  avatarUrl: string | null;
  civicStanding: number | null;
  ideologyX: number | null;
  ideologyY: number | null;
  upvotes: number;
  downvotes: number;
  viewerVote: -1 | 0 | 1;
};

export type SoapboxFeed = {
  posts: SoapboxPostView[];
  missing: boolean;
  error: string | null;
};

export type SharedPrimary = {
  id: string;
  label: string;
};

export type SoapboxActionResult = {
  error?: string;
  message?: string;
};

type SpeechRow = {
  id: string;
  author_id: string;
  content: string;
  tags?: string[] | null;
  upvote_count?: number | null;
  created_at: string;
};

function ready(profile: PlatformProfile | null): profile is PlatformProfile & {
  ideology_x: number;
  ideology_y: number;
} {
  return Boolean(
    profile?.onboarding_completed && profile.ideology_x != null && profile.ideology_y != null,
  );
}

function raceLabel(primary: Primary) {
  const seat = primary.district ? `${primary.state}-${primary.district}` : primary.state;
  const party = primary.party === "republican" ? "republican" : "democrat";
  return `${partyLabel(party)} · ${seat} · ${primary.office_name}`;
}

function migrationError(error: { message?: string; code?: string } | null) {
  if (!error) return null;
  if (isMissingSchema(error)) return MIGRATION_MESSAGE;
  if (/arena_debates_status_check|pending_acceptance|source_post_id|expires_at/i.test(error.message ?? "")) {
    return MIGRATION_MESSAGE;
  }
  return null;
}

async function session() {
  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to continue.", userId: null, admin: null, profile: null };
  const admin = platformAdmin();
  const profile = await loadProfile(admin, userId);
  return { error: null, userId, admin, profile };
}

/** Open same-party primaries this person can contest: home OCD match or an existing ladder row. */
async function contestablePrimaryIds(admin: PlatformAdmin, userId: string, party: Party) {
  const primaries = (await loadPrimaries(admin)).filter(
    (primary) => primary.party === party && !primaryClosed(primary),
  );
  const openIds = new Set(primaries.map((primary) => primary.id));
  const ids = new Set<string>();
  const home = await loadHomeOcdIds(admin, userId);
  for (const primary of primaries) {
    if (ocdMatches(home, primary.ocd_id)) ids.add(primary.id);
  }

  const standings = await admin.from("primary_standings").select("primary_id").eq("user_id", userId);
  if (standings.error) {
    if (!isMissingSchema(standings.error)) throw new Error(standings.error.message);
  } else {
    for (const row of (standings.data ?? []) as { primary_id: string }[]) {
      if (openIds.has(row.primary_id)) ids.add(row.primary_id);
    }
  }
  return { primaries, ids };
}

async function sharedPrimaries(admin: PlatformAdmin, challengerId: string, authorId: string) {
  const [challenger, author] = await Promise.all([
    loadProfile(admin, challengerId),
    loadProfile(admin, authorId),
  ]);
  if (challenger?.is_banned) return { error: BANNED_ARENA_MESSAGE, primaries: [] as SharedPrimary[] };
  if (!ready(challenger)) return { error: "Finish the ideology diagnostic first.", primaries: [] };
  if (!ready(author)) return { error: "This author has not filed a coordinate.", primaries: [] };
  const challengerParty = partyFromCoordinate({ x: challenger.ideology_x, y: challenger.ideology_y });
  const authorParty = partyFromCoordinate({ x: author.ideology_x, y: author.ideology_y });
  if (challengerParty !== authorParty) {
    return { error: "Challenges stay inside your party.", primaries: [] };
  }

  const [mine, theirs] = await Promise.all([
    contestablePrimaryIds(admin, challengerId, challengerParty),
    contestablePrimaryIds(admin, authorId, authorParty),
  ]);
  const shared = mine.primaries
    .filter((primary) => mine.ids.has(primary.id) && theirs.ids.has(primary.id))
    .map((primary) => ({ id: primary.id, label: raceLabel(primary) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { error: null, primaries: shared };
}

export async function loadSoapboxFeed(viewerId: string | null): Promise<SoapboxFeed> {
  try {
    const admin = platformAdmin();
    const selected = "id, author_id, content, tags, upvote_count, created_at";
    const fallback = "id, author_id, content, created_at";
    let posts = await admin
      .from("soapbox_posts")
      .select(selected)
      .order("created_at", { ascending: false })
      .limit(50);
    if (posts.error && isMissingSchema(posts.error)) {
      const legacy = await admin
        .from("soapbox_posts")
        .select(fallback)
        .order("created_at", { ascending: false })
        .limit(50);
      posts = legacy as unknown as typeof posts;
    }
    if (posts.error) {
      const missing = migrationError(posts.error);
      if (missing) return { posts: [], missing: true, error: null };
      return { posts: [], missing: false, error: posts.error.message };
    }

    const rows = (posts.data ?? []) as SpeechRow[];
    if (rows.length === 0) return { posts: [], missing: false, error: null };

    const authorIds = rows.map((row) => row.author_id);
    const postIds = rows.map((row) => row.id);
    const [profiles, standings, votes] = await Promise.all([
      loadProfiles(admin, authorIds),
      admin.from("primary_standings").select("user_id, civic_standing").in("user_id", authorIds),
      admin.from("soapbox_votes").select("post_id, voter_id, direction").in("post_id", postIds),
    ]);

    const standingByUser = new Map<string, number>();
    let standingRows: { user_id: string; civic_standing: number }[] = [];
    if (!standings.error) {
      standingRows = (standings.data ?? []) as { user_id: string; civic_standing: number }[];
    } else if (isMissingSchema(standings.error)) {
      const legacy = await admin.from("primary_standings").select("user_id, elo").in("user_id", authorIds);
      if (legacy.error && !isMissingSchema(legacy.error)) {
        return { posts: [], missing: false, error: legacy.error.message };
      }
      standingRows = ((legacy.data ?? []) as unknown as { user_id: string; elo: number }[]).map((row) => ({
        user_id: row.user_id,
        civic_standing: row.elo,
      }));
    } else {
      return { posts: [], missing: false, error: standings.error.message };
    }
    for (const row of standingRows) {
      const current = standingByUser.get(row.user_id);
      if (current == null || row.civic_standing > current) standingByUser.set(row.user_id, row.civic_standing);
    }

    const tallies = new Map<string, { upvotes: number; downvotes: number; viewerVote: -1 | 0 | 1 }>();
    if (!votes.error) {
      for (const vote of (votes.data ?? []) as { post_id: string; voter_id: string; direction: number }[]) {
        const tally = tallies.get(vote.post_id) ?? { upvotes: 0, downvotes: 0, viewerVote: 0 as const };
        if (vote.direction > 0) tally.upvotes += 1;
        else if (vote.direction < 0) tally.downvotes += 1;
        if (viewerId && vote.voter_id === viewerId) {
          tally.viewerVote = vote.direction > 0 ? 1 : -1;
        }
        tallies.set(vote.post_id, tally);
      }
    } else if (!isMissingSchema(votes.error)) {
      return { posts: [], missing: false, error: votes.error.message };
    }

    return {
      missing: false,
      error: null,
      posts: rows.map((row) => {
        const profile = profiles.get(row.author_id) ?? null;
        const legalName = profile?.legal_name?.trim() || null;
        const tally = tallies.get(row.id);
        const baseUpvotes = row.upvote_count ?? 0;
        return {
          id: row.id,
          authorId: row.author_id,
          content: row.content,
          tags: row.tags ?? [],
          createdAt: row.created_at,
          name: legalName || displayName(profile),
          legalName,
          avatarUrl: profile?.avatar_url ?? null,
          civicStanding: standingByUser.get(row.author_id) ?? null,
          ideologyX: profile?.ideology_x ?? null,
          ideologyY: profile?.ideology_y ?? null,
          upvotes: baseUpvotes + (tally?.upvotes ?? 0),
          downvotes: tally?.downvotes ?? 0,
          viewerVote: tally?.viewerVote ?? 0,
        };
      }),
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load The Soapbox.";
    if (isMissingSchema({ message }) || /service role|supabase/i.test(message)) {
      return { posts: [], missing: true, error: null };
    }
    return { posts: [], missing: false, error: message };
  }
}

export async function createSoapboxPost(content: string): Promise<SoapboxActionResult> {
  try {
    const speech = content.trim();
    if (speech.length < 1 || speech.length > SPEECH_MAX) {
      return { error: "A stump speech is 1 to 280 characters." };
    }
    const current = await session();
    if (!current.userId || !current.admin) return { error: current.error ?? "Sign in to continue." };
    if (current.profile?.is_banned) return { error: BANNED_ARENA_MESSAGE };
    if (!ready(current.profile)) return { error: "Finish the ideology diagnostic first." };

    const { error } = await current.admin.from("soapbox_posts").insert({
      author_id: current.userId,
      content: speech,
    });
    if (error) return { error: migrationError(error) ?? error.message };
    revalidatePath("/soapbox");
    return { message: "Your stump speech is on the Soapbox." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not post that speech." };
  }
}

export async function castSoapboxVote(
  postId: string,
  direction: 1 | -1,
): Promise<SoapboxActionResult & { upvotes?: number; downvotes?: number; viewerVote?: -1 | 0 | 1 }> {
  try {
    if (!isUuid(postId) || (direction !== 1 && direction !== -1)) {
      return { error: "That speech is no longer on the Soapbox." };
    }
    const current = await session();
    if (!current.userId || !current.admin) return { error: current.error ?? "Sign in to continue." };

    const existing = await current.admin
      .from("soapbox_votes")
      .select("direction")
      .eq("post_id", postId)
      .eq("voter_id", current.userId)
      .maybeSingle();
    if (existing.error) return { error: migrationError(existing.error) ?? existing.error.message };

    const previous = (existing.data as { direction: number } | null)?.direction ?? null;
    if (previous === direction) {
      const removed = await current.admin
        .from("soapbox_votes")
        .delete()
        .eq("post_id", postId)
        .eq("voter_id", current.userId);
      if (removed.error) return { error: migrationError(removed.error) ?? removed.error.message };
    } else {
      const saved = await current.admin.from("soapbox_votes").upsert(
        { post_id: postId, voter_id: current.userId, direction },
        { onConflict: "post_id,voter_id" },
      );
      if (saved.error) return { error: migrationError(saved.error) ?? saved.error.message };
    }

    const votes = await current.admin
      .from("soapbox_votes")
      .select("voter_id, direction")
      .eq("post_id", postId);
    if (votes.error) return { error: migrationError(votes.error) ?? votes.error.message };
    let upvotes = 0;
    let downvotes = 0;
    let viewerVote: -1 | 0 | 1 = 0;
    for (const vote of (votes.data ?? []) as { voter_id: string; direction: number }[]) {
      if (vote.direction > 0) upvotes += 1;
      else if (vote.direction < 0) downvotes += 1;
      if (vote.voter_id === current.userId) viewerVote = vote.direction > 0 ? 1 : -1;
    }
    const speech = await current.admin
      .from("soapbox_posts")
      .select("upvote_count")
      .eq("id", postId)
      .maybeSingle();
    const base = speech.error ? 0 : Number((speech.data as { upvote_count?: number | null } | null)?.upvote_count ?? 0);
    revalidatePath("/soapbox");
    return { upvotes: base + upvotes, downvotes, viewerVote };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not record that vote." };
  }
}

export async function loadSharedPrimaries(authorId: string): Promise<{
  primaries: SharedPrimary[];
  error: string | null;
}> {
  try {
    if (!isUuid(authorId)) return { primaries: [], error: "That author is not on the Soapbox." };
    const current = await session();
    if (!current.userId || !current.admin) {
      return { primaries: [], error: current.error ?? "Sign in to continue." };
    }
    if (current.userId === authorId) {
      return { primaries: [], error: "You cannot challenge your own stump speech." };
    }
    const shared = await sharedPrimaries(current.admin, current.userId, authorId);
    return {
      primaries: shared.primaries.map((primary) => ({ id: primary.id, label: primary.label })),
      error: shared.error,
    };
  } catch (caught) {
    return {
      primaries: [],
      error: caught instanceof Error ? caught.message : "Could not load shared primaries.",
    };
  }
}

export async function createSoapboxChallenge(input: {
  postId: string;
  primaryIds: string[];
  openingStance: string;
}): Promise<SoapboxActionResult> {
  try {
    if (!isUuid(input.postId)) return { error: "That speech is no longer on the Soapbox." };
    const stance = input.openingStance.trim();
    if (stance.length < STANCE_MIN || stance.length > STANCE_MAX) {
      return { error: "Opening Statement needs at least a short paragraph and is 500 characters at most." };
    }
    const primaryIds = [...new Set(input.primaryIds.filter((id) => isUuid(id)))];
    if (primaryIds.length === 0) return { error: "Select at least one race." };

    const current = await session();
    if (!current.userId || !current.admin) return { error: current.error ?? "Sign in to continue." };
    if (current.profile?.is_banned) return { error: BANNED_ARENA_MESSAGE };
    if (!ready(current.profile)) return { error: "Finish the ideology diagnostic first." };

    const post = await current.admin
      .from("soapbox_posts")
      .select("id, author_id, content")
      .eq("id", input.postId)
      .maybeSingle();
    if (post.error) return { error: migrationError(post.error) ?? post.error.message };
    const speech = post.data as { id: string; author_id: string; content: string } | null;
    if (!speech) return { error: "That speech is no longer on the Soapbox." };
    if (speech.author_id === current.userId) {
      return { error: "You cannot challenge your own stump speech." };
    }

    const shared = await sharedPrimaries(current.admin, current.userId, speech.author_id);
    if (shared.error) return { error: shared.error };
    const allowed = new Set(shared.primaries.map((primary) => primary.id));
    if (primaryIds.some((id) => !allowed.has(id))) {
      return { error: "Select only races you and the author both contest." };
    }
    const selected = shared.primaries.filter((primary) => primaryIds.includes(primary.id));
    const anchor = selected[0];
    if (!anchor) return { error: "Select at least one race." };

    const author = await loadProfile(current.admin, speech.author_id);
    if (!ready(author)) return { error: "This author has not filed a coordinate." };

    const pending = await current.admin
      .from("arena_debates")
      .select("id")
      .eq("source_post_id", speech.id)
      .eq("candidate_a_id", current.userId)
      .eq("status", "pending_acceptance")
      .limit(1);
    if (pending.error) return { error: migrationError(pending.error) ?? pending.error.message };
    if ((pending.data ?? []).length > 0) {
      return { error: "You already have a challenge pending on this speech." };
    }

    const prompt = await current.admin
      .from("debate_prompts")
      .insert({
        primary_id: anchor.id,
        author_id: speech.author_id,
        author_kind: "user",
        prompt_text: speech.content,
        stance_text: speech.content,
        ideology_x: author.ideology_x,
        ideology_y: author.ideology_y,
        status: "locked",
      })
      .select("id")
      .single();
    if (prompt.error) return { error: prompt.error.message };

    const expiresAt = new Date(Date.now() + ACCEPTANCE_MS).toISOString();
    const inserted = await current.admin
      .from("arena_debates")
      .insert({
        primary_id: anchor.id,
        prompt_id: prompt.data.id,
        candidate_a_id: current.userId,
        candidate_b_id: speech.author_id,
        stance_a: stance,
        stance_b: speech.content,
        status: "pending_acceptance",
        source_post_id: speech.id,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (inserted.error) {
      await current.admin.from("debate_prompts").delete().eq("id", prompt.data.id);
      return { error: migrationError(inserted.error) ?? inserted.error.message };
    }

    const links = await current.admin.from("arena_debate_primaries").insert(
      selected.map((primary) => ({
        debate_id: inserted.data.id,
        primary_id: primary.id,
      })),
    );
    if (links.error) {
      await current.admin.from("arena_debates").delete().eq("id", inserted.data.id);
      await current.admin.from("debate_prompts").delete().eq("id", prompt.data.id);
      return { error: migrationError(links.error) ?? links.error.message };
    }

    revalidatePath("/soapbox");
    return { message: "Challenge filed. The author has 24 hours to accept." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not file that challenge." };
  }
}
