import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "@/lib/coalitions";
import type { AppDatabase } from "@/types/database.types";

type AdminClient = SupabaseClient<AppDatabase>;

export async function recordSpectatorVote(
  admin: AdminClient,
  input: { matchId: string; spectatorId: string; voteForUserId: string },
) {
  const { error: debateVoteError } = await admin.from("debate_votes").insert({
    match_id: input.matchId,
    spectator_id: input.spectatorId,
    vote_for_user_id: input.voteForUserId,
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
    debate_id: input.matchId,
    voter_id: input.spectatorId,
    candidate_id: input.voteForUserId,
  });

  if (voteError?.code === "23505") {
    return { duplicate: true as const };
  }
  if (voteError) return { error: voteError };
  return { duplicate: false as const };
}
