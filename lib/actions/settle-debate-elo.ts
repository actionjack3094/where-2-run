import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateDebateElo } from "@/lib/actions/elo";
import { parseElo } from "@/lib/arena/elo";
import type { AppDatabase } from "@/types/database.types";

type AdminClient = SupabaseClient<AppDatabase>;

/**
 * Recount spectator ballots and write World Football Elo via calculateDebateElo.
 * Ratings land on tournament_participants when the debate belongs to an election.
 */
export async function settleDebateElo(admin: AdminClient, debateId: string) {
  const { data: debate, error } = await admin
    .from("debates")
    .select("id, candidate_a_id, candidate_b_id, election_id, elo_applied_at, status")
    .eq("id", debateId)
    .maybeSingle();

  if (error) throw error;
  if (!debate?.candidate_a_id || !debate.candidate_b_id) return null;
  if (debate.elo_applied_at) return null;
  if (debate.status !== "completed" && debate.status !== "voting" && debate.status !== "active") {
    return null;
  }

  const { data: ballots, error: ballotError } = await admin
    .from("debate_votes")
    .select("voted_for_user_id")
    .eq("debate_id", debateId);

  if (ballotError) throw ballotError;

  const votesA = (ballots ?? []).filter(
    (row) => row.voted_for_user_id === debate.candidate_a_id,
  ).length;
  const votesB = (ballots ?? []).filter(
    (row) => row.voted_for_user_id === debate.candidate_b_id,
  ).length;
  if (votesA + votesB === 0) return null;

  const electionId = debate.election_id;
  async function ratingFor(userId: string) {
    if (electionId) {
      const { data } = await admin
        .from("tournament_participants")
        .select("elo_rating")
        .eq("user_id", userId)
        .eq("election_id", electionId)
        .maybeSingle();
      if (data?.elo_rating != null) return parseElo(data.elo_rating);
    }
    const { data } = await admin.from("users").select("elo_rating").eq("id", userId).maybeSingle();
    return parseElo(data?.elo_rating);
  }

  const [ratingA, ratingB] = await Promise.all([
    ratingFor(debate.candidate_a_id),
    ratingFor(debate.candidate_b_id),
  ]);

  const next = calculateDebateElo(
    { userId: debate.candidate_a_id, rating: ratingA },
    { userId: debate.candidate_b_id, rating: ratingB },
    { votesA, votesB },
  );

  async function writeRating(userId: string, rating: number) {
    await admin.from("users").update({ elo_rating: rating }).eq("id", userId);
    if (!electionId) return;
    const { data: existing } = await admin
      .from("tournament_participants")
      .select("matches_played")
      .eq("user_id", userId)
      .eq("election_id", electionId)
      .maybeSingle();
    await admin.from("tournament_participants").upsert(
      {
        user_id: userId,
        election_id: electionId,
        elo_rating: rating,
        matches_played: Math.max(0, Number(existing?.matches_played) || 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,election_id" },
    );
  }

  await writeRating(debate.candidate_a_id, next.newRatingA);
  await writeRating(debate.candidate_b_id, next.newRatingB);

  await admin
    .from("debates")
    .update({ elo_applied_at: new Date().toISOString() })
    .eq("id", debateId)
    .is("elo_applied_at", null);

  return next;
}
