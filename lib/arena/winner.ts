type DebateSeat = {
  candidate_a_id: string | null;
  candidate_b_id: string | null;
};

type Ballot = {
  candidate_id: string;
};

/** Mirrors `calculate_debate_winner(debate_uuid)` when the RPC is unavailable. */
export function pickDebateWinnerId(
  debate: DebateSeat,
  votes: Ballot[],
): string | null {
  const eligible = new Set(
    [debate.candidate_a_id, debate.candidate_b_id].filter(
      (id): id is string => Boolean(id),
    ),
  );

  const counts = new Map<string, number>();
  for (const vote of votes) {
    if (!eligible.has(vote.candidate_id)) continue;
    counts.set(vote.candidate_id, (counts.get(vote.candidate_id) ?? 0) + 1);
  }

  let winnerId: string | null = null;
  let top = 0;
  let tied = false;

  for (const [candidateId, count] of counts) {
    if (count > top) {
      winnerId = candidateId;
      top = count;
      tied = false;
    } else if (count === top) {
      tied = true;
    }
  }

  if (top === 0 || tied) return null;
  return winnerId;
}
