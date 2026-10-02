import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "@/lib/coalitions";
import type { AppDatabase } from "@/types/database.types";

type AdminClient = SupabaseClient<AppDatabase>;

export async function recordSpectatorVote(
  admin: AdminClient,
  input: { debateId: string; spectatorId: string; votedForUserId: string },
) {
  const { data: debate, error: contextError } = await admin
    .from("debates")
    .select("district_id, election_question_id")
    .eq("id", input.debateId)
    .maybeSingle();

  if (contextError && !isMissingRelation(contextError)) {
    return { error: contextError };
  }

  const { error: debateVoteError } = await admin.from("debate_votes").insert({
    debate_id: input.debateId,
    spectator_id: input.spectatorId,
    voted_for_user_id: input.votedForUserId,
    district_id: debate?.district_id ?? null,
    topic_id: debate?.election_question_id ?? null,
  });

  if (debateVoteError) {
    if (debateVoteError.code === "23505") {
      return { duplicate: true as const };
    }
    if (!isMissingRelation(debateVoteError)) {
      return { error: debateVoteError };
    }
  }

  const { error: voteError } = await admin.from("votes").insert({
    debate_id: input.debateId,
    voter_id: input.spectatorId,
    candidate_id: input.votedForUserId,
  });

  if (voteError?.code === "23505") {
    return { duplicate: true as const };
  }
  if (voteError) return { error: voteError };
  return { duplicate: false as const };
}
