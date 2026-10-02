import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "@/lib/coalitions";
import type { AppDatabase } from "@/types/database.types";

type AdminClient = SupabaseClient<AppDatabase>;

/**
 * Log a spectator response for district-topic telemetry.
 * This does not write a judging ballot and does not change debater ratings.
 */
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
    user_id: input.spectatorId,
    spectator_id: input.spectatorId,
    voted_for_user_id: input.votedForUserId,
    district_id: debate?.district_id ?? null,
    topic_id: debate?.election_question_id ?? null,
    selection: input.votedForUserId,
  });

  if (debateVoteError) {
    if (debateVoteError.code === "23505") {
      return { duplicate: true as const };
    }
    return { error: debateVoteError };
  }

  return { duplicate: false as const };
}
