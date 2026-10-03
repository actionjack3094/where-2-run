"use server";

import { revalidatePath } from "next/cache";
import { notifyChallengeAccepted, notifyExpiringSeats } from "@/lib/actions/notifications";
import { BOT_SPAR_GRACE_MS, sparDueBotSeats, triggerBotSparring } from "@/lib/ai/bots";
import { adjudicateDebate } from "@/lib/ai/judge";
import { isDevelopment } from "@/lib/ai/provider";
import { isUuid } from "@/lib/arena/display";
import { requireActionUserId } from "@/lib/arena/auth";
import { parseElo } from "@/lib/arena/elo";
import { formatOcdDivision, readElectionOcdId } from "@/lib/civic-fencing";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { type DiscoveryDebate, type DiscoverySeat } from "@/lib/debates/discovery";
import {
  loadArenaById,
  loadProfile,
  platformAdmin,
  type PlatformAdmin,
  type PlatformProfile,
} from "@/lib/platform/records";
import { primaryClosed } from "@/lib/platform/cycle";
import { closedPrimaryIds } from "@/lib/platform/freeze";
import { BANNED_ARENA_MESSAGE } from "@/lib/platform/moderation";
import { agendaPromptText, loadCommunityPrompts } from "@/lib/platform/agenda";
import { partyFromCoordinate } from "@/lib/platform/scoring";
import { incrementDebatesLogged } from "@/lib/platform/standings";
import type { PublicJudgment } from "@/lib/platform/types";
import type { Primary } from "@/types/database.types";

type SeatJoin = {
  id: string;
  username: string | null;
  elo_rating: number | string | null;
};

type DistrictJoin = {
  id: string;
  name: string | null;
  ocd_id: string | null;
};

type ElectionJoin = {
  id: string;
  slug: string | null;
  office_name: string | null;
  ocd_id: string | null;
};

type DebateQueryRow = {
  id: string;
  topic: string;
  status: string;
  created_at: string;
  district_id: string | null;
  election_id: string | null;
  winner_id: string | null;
  judge_reasoning?: string | null;
  candidate_a: SeatJoin | SeatJoin[] | null;
  candidate_b: SeatJoin | SeatJoin[] | null;
  district?: DistrictJoin | DistrictJoin[] | null;
};

const DEBATE_SELECT = `
  id, topic, status, created_at, district_id, election_id, winner_id, judge_reasoning,
  candidate_a:users!debates_candidate_a_id_fkey ( id, username, elo_rating ),
  candidate_b:users!debates_candidate_b_id_fkey ( id, username, elo_rating ),
  district:districts ( id, name, ocd_id )
`;

const DEBATE_SELECT_MINIMAL = `
  id, topic, status, created_at, district_id, election_id, winner_id,
  candidate_a:users!debates_candidate_a_id_fkey ( id, username, elo_rating ),
  candidate_b:users!debates_candidate_b_id_fkey ( id, username, elo_rating ),
  district:districts ( id, name )
`;

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toSeat(value: SeatJoin | SeatJoin[] | null | undefined): DiscoverySeat | null {
  const row = unwrapOne(value);
  if (!row?.id) return null;
  return {
    id: row.id,
    username: row.username?.trim() || "Debater",
    elo: parseElo(row.elo_rating),
  };
}

function countFor(
  votes: { debate_id: string; voted_for_user_id: string | null; selection: string | null }[],
  debateId: string,
  candidateAId: string | null,
  candidateBId: string | null,
) {
  let votesA = 0;
  let votesB = 0;
  for (const vote of votes) {
    if (vote.debate_id !== debateId) continue;
    const choice = vote.selection?.trim() || vote.voted_for_user_id;
    if (choice && choice === candidateAId) votesA += 1;
    else if (choice && choice === candidateBId) votesB += 1;
  }
  return { votesA, votesB };
}

export async function loadDiscoveryDebates(): Promise<{
  debates: DiscoveryDebate[];
  error: string | null;
}> {
  const supabase = await createServerSupabase();
  const full = await supabase
    .from("debates")
    .select(DEBATE_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);

  let rows: DebateQueryRow[];
  if (full.error && isMissingSchema(full.error)) {
    const minimal = await supabase
      .from("debates")
      .select(DEBATE_SELECT_MINIMAL)
      .order("created_at", { ascending: false })
      .limit(200);
    if (minimal.error) return { debates: [], error: minimal.error.message };
    rows = (minimal.data ?? []) as DebateQueryRow[];
  } else if (full.error) {
    return { debates: [], error: full.error.message };
  } else {
    rows = (full.data ?? []) as DebateQueryRow[];
  }
  const electionIds = [
    ...new Set(rows.map((row) => row.election_id).filter((id): id is string => Boolean(id))),
  ];
  const electionsById = new Map<string, ElectionJoin>();
  if (electionIds.length > 0) {
    const elections = await supabase
      .from("elections")
      .select("id, slug, office_name, ocd_id")
      .in("id", electionIds);
    if (!elections.error) {
      for (const election of (elections.data ?? []) as ElectionJoin[]) {
        electionsById.set(election.id, election);
      }
    }
  }

  const debateIds = rows.map((row) => row.id);
  let voteRows: {
    debate_id: string;
    voted_for_user_id: string | null;
    selection: string | null;
  }[] = [];
  if (debateIds.length > 0) {
    const votes = await supabase
      .from("debate_votes")
      .select("debate_id, voted_for_user_id, selection")
      .in("debate_id", debateIds);
    if (!votes.error) {
      voteRows = (votes.data ?? []) as typeof voteRows;
    }
  }

  const debates = rows.map((row) => {
    const district = unwrapOne(row.district);
    const election = row.election_id ? electionsById.get(row.election_id) : undefined;
    const ocdId =
      readElectionOcdId(row.election_id, election?.ocd_id) ||
      district?.ocd_id?.trim() ||
      null;
    const districtTag =
      district?.name?.trim() ||
      election?.office_name?.trim() ||
      formatOcdDivision(ocdId) ||
      "Open district";
    const candidateA = toSeat(row.candidate_a);
    const candidateB = toSeat(row.candidate_b);
    const tally = countFor(voteRows, row.id, candidateA?.id ?? null, candidateB?.id ?? null);
    const debate: DiscoveryDebate = {
      id: row.id,
      topic: row.topic,
      status: row.status,
      createdAt: row.created_at,
      districtTag,
      ocdId,
      electionSlug: election?.slug ?? null,
      candidateA,
      candidateB,
      winnerId: row.winner_id,
      judgeReasoning: row.judge_reasoning?.trim() || null,
      votesA: tally.votesA,
      votesB: tally.votesB,
    };
    return debate;
  });

  debates.sort((left, right) => {
    const activity = right.votesA + right.votesB - (left.votesA + left.votesB);
    if (activity !== 0) return activity;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });

  return { debates, error: null };
}

const SEAT_LOCK_MS = 24 * 60 * 60 * 1000;
const PROMPT_MIN = 12;
const STANCE_MIN = 20;
const STANCE_MAX = 2000;

export type DebateActionResult = {
  error?: string;
  message?: string;
  judgment?: PublicJudgment;
};

function refreshArena(slug?: string) {
  revalidatePath("/debates");
  revalidatePath("/elections");
  revalidatePath("/primaries");
  revalidatePath("/ballot");
  if (slug) {
    revalidatePath(`/elections/${slug}`);
    revalidatePath(`/primaries/${slug}`);
  }
}

async function signedIn() {
  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to continue.", userId: null, admin: null, profile: null };
  const admin = platformAdmin();
  const profile = await loadProfile(admin, userId);
  return { error: null, userId, admin, profile };
}

function ready(profile: PlatformProfile | null): profile is PlatformProfile {
  return Boolean(
    profile?.onboarding_completed && profile.ideology_x != null && profile.ideology_y != null,
  );
}

const PRIMARY_BASE =
  "id, party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug, created_at";
const PRIMARY_COLUMNS = `${PRIMARY_BASE}, cycle_year, primary_date, status`;

async function primaryFor(admin: PlatformAdmin, primaryId: string) {
  let result = await admin.from("primaries").select(PRIMARY_COLUMNS).eq("id", primaryId).maybeSingle();
  if (result.error && isMissingSchema(result.error)) {
    result = await admin.from("primaries").select(PRIMARY_BASE).eq("id", primaryId).maybeSingle();
  }
  if (result.error) throw new Error(result.error.message);
  return (result.data as Primary | null) ?? null;
}

function closedMessage(primary: Primary) {
  if (!primaryClosed(primary)) return null;
  return "This primary has closed. Debates are locked.";
}

/** Reopen arena seats whose 24-hour lock expired before a rebuttal was filed. */
export async function releaseExpiredSeats(): Promise<{ released: number }> {
  await notifyExpiringSeats();
  const admin = platformAdmin();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("arena_debates")
    .select("id, prompt_id, primary_id")
    .eq("status", "active")
    .is("stance_b", null)
    .lt("seat_locked_until", now);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; prompt_id: string; primary_id: string }[];
  const closed = await closedPrimaryIds(admin, rows.map((row) => row.primary_id));
  const reopen = rows.filter((row) => !closed.has(row.primary_id));
  const cancel = rows.filter((row) => closed.has(row.primary_id));

  if (reopen.length > 0) {
    const { error: reopenError } = await admin
      .from("arena_debates")
      .update({
        status: "open_challenge",
        candidate_b_id: null,
        seat_locked_until: null,
        updated_at: now,
      })
      .in("id", reopen.map((row) => row.id))
      .eq("status", "active")
      .is("stance_b", null);
    if (reopenError) throw new Error(reopenError.message);
    const promptIds = [...new Set(reopen.map((row) => row.prompt_id))];
    const { error: promptError } = await admin
      .from("debate_prompts")
      .update({ status: "open" })
      .in("id", promptIds)
      .eq("status", "locked");
    if (promptError) throw new Error(promptError.message);
  }

  if (cancel.length > 0) {
    const { error: cancelError } = await admin
      .from("arena_debates")
      .update({
        status: "cancelled",
        candidate_b_id: null,
        seat_locked_until: null,
        updated_at: now,
      })
      .in("id", cancel.map((row) => row.id))
      .eq("status", "active")
      .is("stance_b", null);
    if (cancelError && !isMissingSchema(cancelError)) throw new Error(cancelError.message);
  }

  try {
    await sparDueBotSeats(1);
  } catch (caught) {
    console.error(
      "sparDueBotSeats failed.",
      caught instanceof Error ? caught.message : "Could not spar an open prompt.",
    );
  }
  return { released: reopen.length };
}

export async function createPrimaryDebatePrompt(
  primaryId: string,
  _promptText: string,
  stanceText: string,
  sparWithAi = false,
  sourcePromptId: string | null = null,
): Promise<DebateActionResult> {
  try {
    if (!isUuid(primaryId)) return { error: "That primary is not on the board." };
    const session = await signedIn();
    if (!session.userId || !session.admin) return { error: session.error ?? "Sign in to continue." };
    if (session.profile?.is_banned) throw new Error(BANNED_ARENA_MESSAGE);
    if (!ready(session.profile)) return { error: "Finish the ideology diagnostic first." };

    if (!sourcePromptId || !isUuid(sourcePromptId)) {
      return { error: "Choose an issue from the district agenda." };
    }
    const agenda = await loadCommunityPrompts(primaryId, null, 5);
    if (agenda.missing) return { error: "Apply the constituent agenda migration, then reload." };
    const source = agenda.prompts.find((row) => row.id === sourcePromptId);
    if (!source || source.primaryId !== primaryId) {
      return { error: "Choose one of the top issues on the district agenda." };
    }
    const prompt = agendaPromptText(source.title, source.content);
    const stance = stanceText.trim();
    if (prompt.length < PROMPT_MIN) return { error: "That issue is too short to debate." };
    if (stance.length < STANCE_MIN || stance.length > STANCE_MAX) {
      return { error: "The opening stance needs at least a short paragraph." };
    }

    const primary = await primaryFor(session.admin, primaryId);
    if (!primary) return { error: "That primary is not on the board." };
    const closed = closedMessage(primary);
    if (closed) return { error: closed };
    const party = partyFromCoordinate({
      x: session.profile.ideology_x ?? 0,
      y: session.profile.ideology_y ?? 0,
    });
    if (party !== primary.party) return { error: "You can only open a seat in your own party." };

    const { data: created, error: promptError } = await session.admin
      .from("debate_prompts")
      .insert({
        primary_id: primary.id,
        author_id: session.userId,
        author_kind: "user",
        prompt_text: prompt,
        stance_text: stance,
        ideology_x: session.profile.ideology_x ?? 0,
        ideology_y: session.profile.ideology_y ?? 0,
        status: "open",
        source_prompt_id: source.id,
      })
      .select("id")
      .single();
    if (promptError) {
      if (isMissingSchema(promptError)) return { error: "Apply the constituent agenda migration, then reload." };
      return { error: promptError.message };
    }

    const sparNow = sparWithAi === true && isDevelopment();
    const botSparAt = new Date(Date.now() + (sparNow ? 0 : BOT_SPAR_GRACE_MS)).toISOString();
    const debateRow = {
      primary_id: primary.id,
      prompt_id: created.id,
      candidate_a_id: session.userId,
      stance_a: stance,
      status: "open_challenge" as const,
      bot_spar_at: botSparAt,
    };
    let inserted = await session.admin.from("arena_debates").insert(debateRow).select("id").single();
    if (inserted.error && isMissingSchema(inserted.error)) {
      const { bot_spar_at: _schedule, ...withoutSchedule } = debateRow;
      inserted = await session.admin.from("arena_debates").insert(withoutSchedule).select("id").single();
    }
    if (inserted.error) return { error: inserted.error.message };
    const debateId = inserted.data.id;

    if (sparNow) {
      const spar = await triggerBotSparring(debateId);
      refreshArena(primary.slug);
      if (spar.sparred) {
        return {
          judgment: spar.judgment,
          message: "A same-party sparring partner closed the exchange.",
        };
      }
    }

    refreshArena(primary.slug);
    return { message: "Your opening stance is on the board." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not post that question." };
  }
}

export async function acceptDebateChallenge(debateId: string): Promise<DebateActionResult> {
  try {
    if (!isUuid(debateId)) return { error: "That seat is no longer open." };
    const session = await signedIn();
    if (!session.userId || !session.admin) return { error: session.error ?? "Sign in to continue." };
    if (session.profile?.is_banned) throw new Error(BANNED_ARENA_MESSAGE);
    if (!ready(session.profile)) return { error: "Finish the ideology diagnostic first." };

    const debate = await loadArenaById(session.admin, debateId);
    if (!debate || debate.status !== "open_challenge" || debate.candidate_b_id) {
      return { error: "That seat is no longer open." };
    }
    if (debate.candidate_a_id === session.userId) {
      return { error: "You cannot challenge your own stance." };
    }

    const primary = await primaryFor(session.admin, debate.primary_id);
    if (!primary) return { error: "That primary is not on the board." };
    const closed = closedMessage(primary);
    if (closed) return { error: closed };
    const party = partyFromCoordinate({
      x: session.profile.ideology_x ?? 0,
      y: session.profile.ideology_y ?? 0,
    });
    if (party !== primary.party) return { error: "Challenges stay inside the party." };

    const lockedUntil = new Date(Date.now() + SEAT_LOCK_MS).toISOString();
    const claimPatch = {
      candidate_b_id: session.userId,
      status: "active" as const,
      seat_locked_until: lockedUntil,
      bot_spar_at: null,
      updated_at: new Date().toISOString(),
    };
    let claimed = await session.admin
      .from("arena_debates")
      .update(claimPatch)
      .eq("id", debate.id)
      .eq("status", "open_challenge")
      .is("candidate_b_id", null)
      .select("id")
      .maybeSingle();
    if (claimed.error && isMissingSchema(claimed.error)) {
      const { bot_spar_at: _schedule, ...withoutSchedule } = claimPatch;
      claimed = await session.admin
        .from("arena_debates")
        .update(withoutSchedule)
        .eq("id", debate.id)
        .eq("status", "open_challenge")
        .is("candidate_b_id", null)
        .select("id")
        .maybeSingle();
    }
    if (claimed.error) return { error: claimed.error.message };
    if (!claimed.data) return { error: "That seat is no longer open." };

    await notifyChallengeAccepted(debate.id, debate.candidate_a_id);

    const { error: promptError } = await session.admin
      .from("debate_prompts")
      .update({ status: "locked" })
      .eq("id", debate.prompt_id);
    if (promptError) {
      refreshArena(primary.slug);
      return { error: promptError.message };
    }

    refreshArena(primary.slug);
    return { message: "Seat locked for 24 hours. File your rebuttal before it expires." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not lock that seat." };
  }
}

export async function submitRebuttal(debateId: string, stanceText: string): Promise<DebateActionResult> {
  try {
    if (!isUuid(debateId)) return { error: "That seat is not waiting on a rebuttal." };
    const session = await signedIn();
    if (!session.userId || !session.admin) return { error: session.error ?? "Sign in to continue." };
    if (session.profile?.is_banned) throw new Error(BANNED_ARENA_MESSAGE);

    const debate = await loadArenaById(session.admin, debateId);
    if (!debate || debate.status !== "active") return { error: "That seat is not waiting on a rebuttal." };
    if (debate.candidate_b_id !== session.userId) return { error: "Only the challenger files the rebuttal." };

    const lock = debate.seat_locked_until ? Date.parse(debate.seat_locked_until) : NaN;
    if (!Number.isFinite(lock) || lock <= Date.now()) {
      return { error: "The 24-hour lock has expired." };
    }

    const stance = stanceText.trim();
    if (stance.length < STANCE_MIN || stance.length > STANCE_MAX) {
      return { error: "The rebuttal needs at least a short paragraph." };
    }

    const { data: filed, error } = await session.admin
      .from("arena_debates")
      .update({
        stance_b: stance,
        status: "concluded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", debate.id)
      .eq("status", "active")
      .eq("candidate_b_id", session.userId)
      .select("id")
      .maybeSingle();
    if (error) return { error: error.message };
    if (!filed) return { error: "That seat is not waiting on a rebuttal." };

    try {
      const judged = await adjudicateDebate(debate.id);
      await incrementDebatesLogged(session.admin, debate.primary_id, [
        debate.candidate_a_id,
        session.userId,
      ]);
      refreshArena();
      return { judgment: judged.b, message: "The exchange is closed." };
    } catch (caught) {
      await session.admin
        .from("arena_debates")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", debate.id)
        .is("candidate_a_score", null);
      return { error: caught instanceof Error ? caught.message : "Could not file that rebuttal." };
    }
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not file that rebuttal." };
  }
}
