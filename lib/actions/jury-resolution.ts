import { debateDistrictOcdId } from "@/lib/actions/debate-resolution";
import {
  ALIGNMENT_RELEASE_STREAK,
  relockEscrowPledges,
} from "@/lib/actions/pledge-release";
import { isUuid } from "@/lib/arena/display";
import { parseElo, ratingsAfterResult } from "@/lib/arena/elo";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { notifyVerdictOverturned } from "@/lib/notifications/inbox";
import type { Debate, JuryAppeal } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Verified-constituent verdicts required before the appeal is adjudicated. */
export const JURY_QUORUM = 3;

export type EloRollback = {
  candidateId: string;
  from: number;
  to: number;
  role: "winner" | "loser";
};

export type StreakRollback = {
  candidateId: string;
  electionId: string;
  from: number;
  to: number;
};

export type JuryRollback = {
  previousWinnerId: string | null;
  newWinnerId: string | null;
  elo: EloRollback[];
  streaks: StreakRollback[];
  pledgesRelocked: number;
  pledgesRelockedAmount: number;
};

export type JuryResolutionResult =
  | {
      ok: true;
      status: "pending";
      appealId: string;
      debateId: string;
      verdicts: number;
      quorum: number;
      overturnedVotes: number;
    }
  | {
      ok: true;
      status: "upheld";
      appealId: string;
      debateId: string;
      verdicts: number;
      quorum: number;
      overturnedVotes: number;
    }
  | {
      ok: true;
      status: "overturned";
      appealId: string;
      debateId: string;
      verdicts: number;
      quorum: number;
      overturnedVotes: number;
      rollback: JuryRollback;
    }
  | { ok: false; error: string };

type AppealRow = Pick<JuryAppeal, "id" | "debate_id" | "status">;

function majorityOverturned(overturnedVotes: number, verdicts: number) {
  return verdicts > 0 && overturnedVotes / verdicts > 0.5;
}

async function writeEloRating(admin: AdminClient, userId: string, eloRating: number) {
  const { error } = await admin
    .from("users")
    .update({ elo_rating: eloRating, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

async function revertElo(
  admin: AdminClient,
  winnerId: string,
  loserId: string,
): Promise<EloRollback[]> {
  const { data, error } = await admin
    .from("users")
    .select("id, elo_rating")
    .in("id", [winnerId, loserId]);
  if (error) throw new Error(error.message);

  const eloById = new Map(
    ((data ?? []) as { id: string; elo_rating: number | string | null }[]).map((row) => [
      row.id,
      parseElo(row.elo_rating),
    ]),
  );
  const winnerFrom = eloById.get(winnerId) ?? parseElo(null);
  const loserFrom = eloById.get(loserId) ?? parseElo(null);
  // Recalculate as if the original loser had won, undoing the last K=32 swing.
  const next = ratingsAfterResult(loserFrom, winnerFrom);

  await writeEloRating(admin, loserId, next.winnerElo);
  await writeEloRating(admin, winnerId, next.loserElo);

  return [
    { candidateId: winnerId, from: winnerFrom, to: next.loserElo, role: "winner" },
    { candidateId: loserId, from: loserFrom, to: next.winnerElo, role: "loser" },
  ];
}

async function invertDebateWinner(admin: AdminClient, debate: Debate, newWinnerId: string | null) {
  const { error } = await admin
    .from("debates")
    .update({
      winner_id: newWinnerId,
      candidate_a_votes: debate.candidate_b_votes,
      candidate_b_votes: debate.candidate_a_votes,
      candidate_a_weighted_votes: debate.candidate_b_weighted_votes ?? 0,
      candidate_b_weighted_votes: debate.candidate_a_weighted_votes ?? 0,
    })
    .eq("id", debate.id);
  if (error) throw new Error(error.message);
}

async function loadRaceTargets(
  admin: AdminClient,
  candidateIds: string[],
  debate: Debate,
) {
  if (candidateIds.length === 0) return [];

  let electionIds: string[] = debate.election_id ? [debate.election_id] : [];
  if (electionIds.length === 0) {
    const ocdId = await debateDistrictOcdId(admin, debate);
    if (ocdId) {
      const { data, error } = await admin.from("elections").select("id").eq("ocd_id", ocdId);
      if (error) throw new Error(error.message);
      electionIds = ((data ?? []) as { id: string }[]).map((row) => row.id);
    }
  }
  if (electionIds.length === 0) return [];

  const { data, error } = await admin
    .from("campaign_targets")
    .select("id, user_id, election_id, alignment_streak")
    .in("user_id", candidateIds)
    .in("election_id", electionIds);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []) as {
    id: string;
    user_id: string;
    election_id: string;
    alignment_streak: number | null;
  }[];
}

async function decrementStreaksAndRelockPledges(
  admin: AdminClient,
  debate: Debate,
  candidateIds: string[],
): Promise<{ streaks: StreakRollback[]; pledgesRelocked: number; pledgesRelockedAmount: number }> {
  const targets = await loadRaceTargets(admin, candidateIds, debate);
  const streaks: StreakRollback[] = [];
  let pledgesRelocked = 0;
  let pledgesRelockedAmount = 0;

  for (const target of targets) {
    const from = Math.max(0, target.alignment_streak ?? 0);
    const to = Math.max(0, from - 1);
    if (to === from) continue;

    const { error } = await admin
      .from("campaign_targets")
      .update({ alignment_streak: to })
      .eq("id", target.id)
      .eq("alignment_streak", from);
    if (error) throw new Error(error.message);

    streaks.push({
      candidateId: target.user_id,
      electionId: target.election_id,
      from,
      to,
    });

    if (from >= ALIGNMENT_RELEASE_STREAK && to < ALIGNMENT_RELEASE_STREAK) {
      const relocked = await relockEscrowPledges(target.user_id, target.election_id);
      pledgesRelocked += relocked.relocked;
      pledgesRelockedAmount += relocked.relockedAmount;
    }
  }

  const { data: debatePledges, error: debatePledgeError } = await admin
    .from("campaign_pledges")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("debate_id", debate.id)
    .eq("status", "released")
    .is("disbursed_at", null)
    .select("id, amount");
  if (debatePledgeError && !isMissingRelation(debatePledgeError)) {
    throw new Error(debatePledgeError.message);
  }
  for (const pledge of debatePledges ?? []) {
    pledgesRelocked += 1;
    pledgesRelockedAmount += Number(pledge.amount);
  }

  return { streaks, pledgesRelocked, pledgesRelockedAmount };
}

async function overturnDebate(
  admin: AdminClient,
  debate: Debate,
): Promise<JuryRollback> {
  const previousWinnerId = debate.winner_id;
  const newWinnerId =
    previousWinnerId === debate.candidate_a_id
      ? debate.candidate_b_id
      : previousWinnerId === debate.candidate_b_id
        ? debate.candidate_a_id
        : null;

  const elo =
    previousWinnerId && newWinnerId && debate.elo_applied_at
      ? await revertElo(admin, previousWinnerId, newWinnerId)
      : [];

  await invertDebateWinner(admin, debate, newWinnerId);

  const seated = [debate.candidate_a_id, debate.candidate_b_id].filter(
    (id): id is string => Boolean(id),
  );
  const { streaks, pledgesRelocked, pledgesRelockedAmount } =
    await decrementStreaksAndRelockPledges(admin, debate, seated);

  return {
    previousWinnerId,
    newWinnerId,
    elo,
    streaks,
    pledgesRelocked,
    pledgesRelockedAmount,
  };
}

/**
 * Close a pending appeal once a 3-verdict quorum is in. A majority to overturn
 * reverses Elo, decrements alignment streaks for the race, and relocks escrow
 * that this debate's streak had released. Below quorum this is a no-op.
 *
 * Not a server action: it writes with the service role and is only called from
 * submitJuryVerdict and trusted scripts.
 */
export async function resolveJuryAppeal(appealId: string): Promise<JuryResolutionResult> {
  const id = appealId.trim();
  if (!isUuid(id)) return { ok: false, error: "Choose a valid appeal to resolve." };

  const admin = createAdminClient();
  const { data: appealRow, error: appealError } = await admin
    .from("jury_appeals")
    .select("id, debate_id, status")
    .eq("id", id)
    .maybeSingle();
  if (appealError) {
    if (isMissingRelation(appealError)) {
      return { ok: false, error: "jury_appeals is not in the database yet." };
    }
    throw new Error(appealError.message);
  }

  const appeal = appealRow as AppealRow | null;
  if (!appeal || !appeal.status) {
    return { ok: false, error: "Appeal not found." };
  }

  const { data: verdictRows, error: verdictError } = await admin
    .from("jury_verdicts")
    .select("overturned")
    .eq("appeal_id", appeal.id);
  if (verdictError) {
    if (isMissingRelation(verdictError)) {
      return { ok: false, error: "jury_verdicts is not in the database yet." };
    }
    throw new Error(verdictError.message);
  }

  const verdicts = (verdictRows ?? []) as { overturned: boolean }[];
  const verdictCount = verdicts.length;
  const overturnedVotes = verdicts.filter((row) => row.overturned).length;

  if (appeal.status === "upheld") {
    return {
      ok: true,
      status: "upheld",
      appealId: appeal.id,
      debateId: appeal.debate_id,
      verdicts: verdictCount,
      quorum: JURY_QUORUM,
      overturnedVotes,
    };
  }

  if (appeal.status === "overturned") {
    return {
      ok: true,
      status: "overturned",
      appealId: appeal.id,
      debateId: appeal.debate_id,
      verdicts: verdictCount,
      quorum: JURY_QUORUM,
      overturnedVotes,
      rollback: {
        previousWinnerId: null,
        newWinnerId: null,
        elo: [],
        streaks: [],
        pledgesRelocked: 0,
        pledgesRelockedAmount: 0,
      },
    };
  }

  if (appeal.status !== "pending") {
    return { ok: false, error: "This appeal is closed." };
  }

  if (verdictCount < JURY_QUORUM) {
    return {
      ok: true,
      status: "pending",
      appealId: appeal.id,
      debateId: appeal.debate_id,
      verdicts: verdictCount,
      quorum: JURY_QUORUM,
      overturnedVotes,
    };
  }

  const nextStatus = majorityOverturned(overturnedVotes, verdictCount)
    ? "overturned"
    : "upheld";

  const { data: claimed, error: claimError } = await admin
    .from("jury_appeals")
    .update({ status: nextStatus })
    .eq("id", appeal.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) {
    return {
      ok: true,
      status: "pending",
      appealId: appeal.id,
      debateId: appeal.debate_id,
      verdicts: verdictCount,
      quorum: JURY_QUORUM,
      overturnedVotes,
    };
  }

  if (nextStatus === "upheld") {
    return {
      ok: true,
      status: "upheld",
      appealId: appeal.id,
      debateId: appeal.debate_id,
      verdicts: verdictCount,
      quorum: JURY_QUORUM,
      overturnedVotes,
    };
  }

  const { data: debateRow, error: debateError } = await admin
    .from("debates")
    .select("*")
    .eq("id", appeal.debate_id)
    .maybeSingle();
  if (debateError) throw new Error(debateError.message);
  const debate = debateRow as Debate | null;
  if (!debate) return { ok: false, error: "Debate not found." };

  const rollback = await overturnDebate(admin, debate);
  await notifyVerdictOverturned(admin, {
    appealId: appeal.id,
    winnerId: rollback.previousWinnerId,
  });

  return {
    ok: true,
    status: "overturned",
    appealId: appeal.id,
    debateId: debate.id,
    verdicts: verdictCount,
    quorum: JURY_QUORUM,
    overturnedVotes,
    rollback,
  };
}
