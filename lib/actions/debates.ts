"use server";

import { revalidatePath } from "next/cache";
import { adjudicateDebate } from "@/lib/ai/judge";
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
import { partyFromCoordinate } from "@/lib/platform/scoring";
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
const STANCE_MIN = 20;
const STANCE_MAX = 2000;

export type DebateActionResult = {
  error?: string;
  message?: string;
  judgment?: PublicJudgment;
};

function refreshArena(slug?: string) {
  revalidatePath("/debates");
  revalidatePath("/primaries");
  revalidatePath("/ballot");
  if (slug) revalidatePath(`/primaries/${slug}`);
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

async function primaryFor(admin: PlatformAdmin, primaryId: string) {
  const { data, error } = await admin
    .from("primaries")
    .select("id, party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug, created_at")
    .eq("id", primaryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Primary | null) ?? null;
}

export async function acceptDebateChallenge(debateId: string): Promise<DebateActionResult> {
  try {
    if (!isUuid(debateId)) return { error: "That seat is no longer open." };
    const session = await signedIn();
    if (!session.userId || !session.admin) return { error: session.error ?? "Sign in to continue." };
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
    const party = partyFromCoordinate({
      x: session.profile.ideology_x ?? 0,
      y: session.profile.ideology_y ?? 0,
    });
    if (party !== primary.party) return { error: "Challenges stay inside the party." };

    const lockedUntil = new Date(Date.now() + SEAT_LOCK_MS).toISOString();
    const { data: claimed, error } = await session.admin
      .from("arena_debates")
      .update({
        candidate_b_id: session.userId,
        status: "active",
        seat_locked_until: lockedUntil,
        updated_at: new Date().toISOString(),
      })
      .eq("id", debate.id)
      .eq("status", "open_challenge")
      .is("candidate_b_id", null)
      .select("id")
      .maybeSingle();
    if (error) return { error: error.message };
    if (!claimed) return { error: "That seat is no longer open." };

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
