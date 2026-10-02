"use server";

import { recordSpectatorVote } from "@/lib/actions/debate-votes";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createServerSupabase } from "@/lib/db/supabase-server";

export type SpectatorTally = {
  votesA: number;
  votesB: number;
  margin: number;
};

export async function castSpectatorVote(
  debateId: string,
  votedForUserId: string,
): Promise<SpectatorTally> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to vote.");

  const admin = createAdminClient();
  const { data: debate, error: debateError } = await admin
    .from("debates")
    .select("candidate_a_id, candidate_b_id")
    .eq("id", debateId)
    .maybeSingle();
  if (debateError) throw new Error(debateError.message);
  if (!debate?.candidate_a_id || !debate.candidate_b_id) {
    throw new Error("Both debaters must be seated before voting.");
  }
  if (votedForUserId !== debate.candidate_a_id && votedForUserId !== debate.candidate_b_id) {
    throw new Error("Vote for one of the seated debaters.");
  }

  const recorded = await recordSpectatorVote(admin, {
    debateId,
    spectatorId: user.id,
    votedForUserId,
  });
  if (recorded.duplicate) throw new Error("You already voted in this debate.");
  if (recorded.error) throw new Error(recorded.error.message);

  return tallyDebate(debateId);
}

export async function loadSpectatorTally(debateId: string): Promise<SpectatorTally> {
  return tallyDebate(debateId);
}

async function tallyDebate(debateId: string): Promise<SpectatorTally> {
  const admin = createAdminClient();
  const { data: debate, error } = await admin
    .from("debates")
    .select("candidate_a_id, candidate_b_id")
    .eq("id", debateId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const { data: ballots, error: ballotError } = await admin
    .from("debate_votes")
    .select("voted_for_user_id")
    .eq("debate_id", debateId);
  if (ballotError) throw new Error(ballotError.message);

  const votesA = (ballots ?? []).filter(
    (row) => row.voted_for_user_id === debate?.candidate_a_id,
  ).length;
  const votesB = (ballots ?? []).filter(
    (row) => row.voted_for_user_id === debate?.candidate_b_id,
  ).length;
  const total = votesA + votesB;
  const margin = total === 0 ? 0 : Math.abs(votesA - votesB) / total;

  return { votesA, votesB, margin };
}
