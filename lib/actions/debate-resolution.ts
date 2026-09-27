import { createAdminClient } from "@/lib/db/supabase-admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type DebateRecord = {
  id: string;
  debates_won: number | null;
  debates_played: number | null;
};

async function countVotes(
  admin: AdminClient,
  debateId: string,
  candidateId: string | null,
) {
  if (!candidateId) return 0;

  const { count, error } = await admin
    .from("votes")
    .select("id", { count: "exact", head: true })
    .eq("debate_id", debateId)
    .eq("candidate_id", candidateId)
    .is("voided_at", null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

function loserIdFor(
  winnerId: string,
  candidateAId: string | null,
  candidateBId: string | null,
) {
  if (winnerId === candidateAId) return candidateBId;
  if (winnerId === candidateBId) return candidateAId;
  return null;
}

async function loadRecords(admin: AdminClient, candidateIds: string[]) {
  const { data, error } = await admin
    .from("candidate_stats")
    .select("id, debates_won, debates_played")
    .in("id", candidateIds);

  if (error) throw new Error(error.message);

  return new Map(
    ((data ?? []) as DebateRecord[]).map((row) => [row.id, row]),
  );
}

/**
 * `candidate_stats.debates_won` / `debates_played` are the win-loss record.
 * Losses are played debates that were not wins.
 */
async function incrementMatchRecord(
  admin: AdminClient,
  winnerId: string,
  loserId: string,
  prior: Map<string, DebateRecord>,
) {
  const winner = prior.get(winnerId);
  const loser = prior.get(loserId);
  const winnerWins = Math.max(0, winner?.debates_won ?? 0);
  const winnerPlayed = Math.max(winnerWins, winner?.debates_played ?? 0);
  const loserWins = Math.max(0, loser?.debates_won ?? 0);
  const loserPlayed = Math.max(loserWins, loser?.debates_played ?? 0);

  const { error: winnerError } = await admin
    .from("candidate_stats")
    .update({
      debates_won: winnerWins + 1,
      debates_played: winnerPlayed + 1,
    })
    .eq("id", winnerId);

  if (winnerError) throw new Error(winnerError.message);

  const { error: loserError } = await admin
    .from("candidate_stats")
    .update({
      debates_played: loserPlayed + 1,
    })
    .eq("id", loserId);

  if (loserError) throw new Error(loserError.message);
}

/** Tallies the spectator ballot and marks an open debate completed. Returns the debate id when the row was updated. */
export async function resolveDebate(debateId: string): Promise<string | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("debates")
    .select("id, candidate_a_id, candidate_b_id, status")
    .eq("id", debateId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.status !== "voting") return null;

  const candidateAVotes = await countVotes(admin, debateId, data.candidate_a_id);
  const candidateBVotes = await countVotes(admin, debateId, data.candidate_b_id);

  let winnerId: string | null = null;
  if (candidateAVotes > candidateBVotes) winnerId = data.candidate_a_id;
  else if (candidateBVotes > candidateAVotes) winnerId = data.candidate_b_id;

  const loserId = winnerId
    ? loserIdFor(winnerId, data.candidate_a_id, data.candidate_b_id)
    : null;
  const priorRecords =
    winnerId && loserId ? await loadRecords(admin, [winnerId, loserId]) : null;

  const { data: saved, error: updateError } = await admin
    .from("debates")
    .update({
      status: "completed",
      candidate_a_votes: candidateAVotes,
      candidate_b_votes: candidateBVotes,
      winner_id: winnerId,
    })
    .eq("id", debateId)
    .eq("status", "voting")
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!saved) return null;

  const { error: eloError } = await admin.rpc("apply_debate_elo", {
    debate_uuid: debateId,
  });
  if (eloError) throw new Error(eloError.message);

  if (winnerId && loserId && priorRecords) {
    await incrementMatchRecord(admin, winnerId, loserId, priorRecords);
  }

  return saved.id;
}
