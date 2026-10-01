import type { SupabaseClient } from "@supabase/supabase-js";
import {
  K_EARLY,
  parseElo,
  ratingsAfterVoteMargin,
  type TournamentStage,
} from "@/lib/actions/elo";
import { pickDebateWinnerId } from "@/lib/arena/winner";
import { isMissingRelation } from "@/lib/coalitions";
import type { AppDatabase, Debate, Vote } from "@/types/database.types";

type AdminClient = SupabaseClient<AppDatabase>;

type DebateRow = Pick<
  Debate,
  | "id"
  | "status"
  | "expires_at"
  | "candidate_a_id"
  | "candidate_b_id"
  | "election_id"
> & {
  elo_applied_at?: string | null;
};

type SpectatorBallot = { voteForUserId: string };

async function writeGlobalElo(admin: AdminClient, userId: string, eloRating: number) {
  const viewUpdate = await admin
    .from("candidate_stats")
    .update({ elo_rating: eloRating })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (!viewUpdate.error) return;

  const { error } = await admin
    .from("users")
    .update({ elo_rating: eloRating })
    .eq("id", userId);

  if (error) throw error;
}

async function loadTournamentElo(
  admin: AdminClient,
  userId: string,
  electionId: string | null,
) {
  if (electionId) {
    await admin.from("tournament_participants").upsert(
      { user_id: userId, election_id: electionId },
      { onConflict: "user_id,election_id", ignoreDuplicates: true },
    );
    const { data } = await admin
      .from("tournament_participants")
      .select("elo_rating")
      .eq("user_id", userId)
      .eq("election_id", electionId)
      .maybeSingle();
    if (data?.elo_rating != null) return parseElo(data.elo_rating);
  }

  const { data } = await admin
    .from("users")
    .select("elo_rating")
    .eq("id", userId)
    .maybeSingle();
  return parseElo(data?.elo_rating);
}

async function writeTournamentElo(
  admin: AdminClient,
  userId: string,
  electionId: string | null,
  eloRating: number,
) {
  await writeGlobalElo(admin, userId, eloRating);
  if (!electionId) return;

  const { data: existing } = await admin
    .from("tournament_participants")
    .select("matches_played")
    .eq("user_id", userId)
    .eq("election_id", electionId)
    .maybeSingle();

  const played = Math.max(0, Number(existing?.matches_played) || 0);
  const { error } = await admin.from("tournament_participants").upsert(
    {
      user_id: userId,
      election_id: electionId,
      elo_rating: eloRating,
      matches_played: played + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,election_id" },
  );
  if (error && !isMissingRelation(error)) throw error;
}

async function loadSpectatorBallots(
  admin: AdminClient,
  debateId: string,
): Promise<SpectatorBallot[]> {
  const { data, error } = await admin
    .from("debate_votes")
    .select("vote_for_user_id")
    .eq("match_id", debateId);

  if (!error) {
    return ((data ?? []) as { vote_for_user_id: string }[]).map((row) => ({
      voteForUserId: row.vote_for_user_id,
    }));
  }

  if (!isMissingRelation(error)) throw error;

  const { data: votes } = await admin
    .from("votes")
    .select("candidate_id")
    .eq("debate_id", debateId)
    .is("voided_at", null);

  return ((votes ?? []) as Pick<Vote, "candidate_id">[]).map((row) => ({
    voteForUserId: row.candidate_id,
  }));
}

async function resolveWinnerId(
  admin: AdminClient,
  debate: DebateRow,
  ballots: SpectatorBallot[],
) {
  const { data, error } = await admin.rpc("calculate_debate_winner", {
    debate_uuid: debate.id,
  });
  if (!error) return data ?? null;

  return pickDebateWinnerId(
    debate,
    ballots.map((ballot) => ({ candidate_id: ballot.voteForUserId })),
  );
}

export async function applyDebateElo(
  admin: AdminClient,
  debateId: string,
  k: number | TournamentStage = K_EARLY,
) {
  const { data: debateRow, error: debateError } = await admin
    .from("debates")
    .select("*")
    .eq("id", debateId)
    .maybeSingle();

  if (debateError) throw debateError;
  const debate = debateRow as DebateRow | null;
  if (!debate) return { skipped: "missing_debate" as const };
  if (debate.elo_applied_at) return { skipped: "already_applied" as const };
  if (!debate.candidate_a_id || !debate.candidate_b_id) {
    return { skipped: "open_seat" as const };
  }

  const expired =
    Number.isFinite(Date.parse(debate.expires_at)) &&
    Date.parse(debate.expires_at) <= Date.now();

  if (debate.status !== "completed") {
    if (
      !expired ||
      (debate.status !== "active" && debate.status !== "voting")
    ) {
      return { skipped: "not_concluded" as const };
    }

    const { error: closeError } = await admin
      .from("debates")
      .update({ status: "completed" })
      .eq("id", debate.id)
      .in("status", ["active", "voting"]);

    if (closeError) throw closeError;
  }

  const ballots = await loadSpectatorBallots(admin, debate.id);
  const winnerId = await resolveWinnerId(admin, debate, ballots);
  const loserId =
    winnerId === debate.candidate_a_id
      ? debate.candidate_b_id
      : winnerId === debate.candidate_b_id
        ? debate.candidate_a_id
        : null;

  if (!winnerId || !loserId) {
    await admin
      .from("debates")
      .update({ elo_applied_at: new Date().toISOString() })
      .eq("id", debate.id)
      .is("elo_applied_at", null);
    return { skipped: "no_winner" as const };
  }

  const winnerVotes = ballots.filter((ballot) => ballot.voteForUserId === winnerId).length;
  const loserVotes = ballots.filter((ballot) => ballot.voteForUserId === loserId).length;

  const [winnerRating, loserRating] = await Promise.all([
    loadTournamentElo(admin, winnerId, debate.election_id),
    loadTournamentElo(admin, loserId, debate.election_id),
  ]);

  const next = ratingsAfterVoteMargin({
    winnerId,
    loserId,
    winnerRating,
    loserRating,
    winnerVotes,
    loserVotes,
    k,
  });

  await writeTournamentElo(admin, winnerId, debate.election_id, next.winner.nextRating);
  await writeTournamentElo(admin, loserId, debate.election_id, next.loser.nextRating);

  const { error: stampError } = await admin
    .from("debates")
    .update({ elo_applied_at: new Date().toISOString() })
    .eq("id", debate.id)
    .is("elo_applied_at", null);

  if (stampError) throw stampError;

  return {
    skipped: null,
    winnerId,
    loserId,
    winnerElo: next.winner.nextRating,
    loserElo: next.loser.nextRating,
    expectedWinner: next.winner.expected,
    expectedLoser: next.loser.expected,
    margin: next.winner.margin,
    k: next.winner.k,
  };
}

export async function lockDebateEloAfterArbitration(
  admin: AdminClient,
  debate: Debate,
  _evaluations: unknown[],
) {
  if (debate.status === "active" || debate.status === "voting") {
    const { error } = await admin
      .from("debates")
      .update({ status: "completed" })
      .eq("id", debate.id)
      .in("status", ["active", "voting"]);
    if (error) throw error;
  }

  return applyDebateElo(admin, debate.id);
}

export async function settleExpiredDebateElo(
  admin: AdminClient,
  debateId?: string,
  k: number | TournamentStage = K_EARLY,
) {
  try {
    await admin.rpc("complete_expired_debates");
  } catch (error) {
    console.error("complete_expired_debates failed", error);
  }

  if (!debateId) return { skipped: "no_debate" as const };

  try {
    return await applyDebateElo(admin, debateId, k);
  } catch (error) {
    console.error("applyDebateElo failed", error);
    return { skipped: "elo_error" as const };
  }
}
