import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";

type ExpiredDebate = {
  id: string;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
};

async function countVotes(
  admin: ReturnType<typeof createAdminClient>,
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

export async function GET() {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await admin
      .from("debates")
      .select("id, candidate_a_id, candidate_b_id")
      .eq("status", "voting")
      .lte("expires_at", now);

    if (error) throw new Error(error.message);

    const expired = (data ?? []) as ExpiredDebate[];
    const resolved: string[] = [];

    for (const debate of expired) {
      const candidateAVotes = await countVotes(admin, debate.id, debate.candidate_a_id);
      const candidateBVotes = await countVotes(admin, debate.id, debate.candidate_b_id);

      let winnerId: string | null = null;
      if (candidateAVotes > candidateBVotes) winnerId = debate.candidate_a_id;
      else if (candidateBVotes > candidateAVotes) winnerId = debate.candidate_b_id;

      const { data: saved, error: updateError } = await admin
        .from("debates")
        .update({
          status: "completed",
          candidate_a_votes: candidateAVotes,
          candidate_b_votes: candidateBVotes,
          winner_id: winnerId,
        })
        .eq("id", debate.id)
        .eq("status", "voting")
        .select("id")
        .maybeSingle();

      if (updateError) throw new Error(updateError.message);
      if (saved) resolved.push(saved.id);
    }

    return NextResponse.json({ resolved }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resolve debates.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
