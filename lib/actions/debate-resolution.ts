import { createAdminClient } from "@/lib/db/supabase-admin";

type AdminClient = ReturnType<typeof createAdminClient>;

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
    .eq("candidate_id", candidateId);

  if (error) throw new Error(error.message);
  return count ?? 0;
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
  return saved?.id ?? null;
}
