import { normalizeOcdId } from "@/lib/civic-fencing";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { formatTally, type Tally } from "@/lib/vote-weight";

type AdminClient = ReturnType<typeof createAdminClient>;

type DebateRecord = {
  id: string;
  debates_won: number | null;
  debates_played: number | null;
};

const PAGE_SIZE = 1000;

/**
 * The district a debate was filed in, as a normalized OCD-ID: the election's
 * OCD-ID, else the OCD-ID on its district row. Mirrors debate_district_ocd_id().
 */
export async function debateDistrictOcdId(
  admin: AdminClient,
  debate: {
    election_id: string | null;
    election_question_id: string | null;
    district_id: string | null;
  },
) {
  let electionId = debate.election_id;
  if (!electionId && debate.election_question_id) {
    const { data, error } = await admin
      .from("election_questions")
      .select("election_id")
      .eq("id", debate.election_question_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    electionId = (data as { election_id: string | null } | null)?.election_id ?? null;
  }

  let districtId = debate.district_id;
  if (electionId) {
    const { data, error } = await admin
      .from("elections")
      .select("ocd_id, district_id")
      .eq("id", electionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const election = data as { ocd_id: string | null; district_id: string | null } | null;
    const direct = normalizeOcdId(election?.ocd_id);
    if (direct) return direct;
    districtId = election?.district_id ?? districtId;
  }

  if (!districtId) return null;
  const { data, error } = await admin
    .from("districts")
    .select("ocd_id")
    .eq("id", districtId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeOcdId((data as { ocd_id: string | null } | null)?.ocd_id) || null;
}

/** Official ballots for the two seated candidates, paged past the 1000-row API cap. */
async function loadBallots(
  admin: AdminClient,
  debateId: string,
  candidateIds: string[],
) {
  const ballots: { voter_id: string; candidate_id: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("votes")
      .select("voter_id, candidate_id")
      .eq("debate_id", debateId)
      .in("candidate_id", candidateIds)
      .is("voided_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as { voter_id: string; candidate_id: string }[];
    ballots.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return ballots;
}

export type DebateResolution = {
  id: string;
  winnerId: string | null;
  districtOcdId: string | null;
  /** One ballot each. Saved to debates.candidate_*_votes. */
  raw: Tally;
  /** Equal-weight official totals. Spectator telemetry is not included. */
  weighted: Tally;
  verifiedBallots: number;
  /** "Raw Votes: X–Y | Weighted Votes: Xw–Yw" */
  summary: string;
};

async function tallyBallots(
  admin: AdminClient,
  debate: {
    id: string;
    candidate_a_id: string | null;
    candidate_b_id: string | null;
    election_id: string | null;
    election_question_id: string | null;
    district_id: string | null;
  },
) {
  const seated = [debate.candidate_a_id, debate.candidate_b_id].filter(
    (id): id is string => Boolean(id),
  );
  const districtOcdId = await debateDistrictOcdId(admin, debate);
  const ballots = seated.length > 0 ? await loadBallots(admin, debate.id, seated) : [];

  const raw: Tally = { a: 0, b: 0 };
  for (const ballot of ballots) {
    const side = ballot.candidate_id === debate.candidate_a_id ? "a" : "b";
    raw[side] += 1;
  }

  return { raw, weighted: { ...raw }, verifiedBallots: 0, districtOcdId };
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

/**
 * Tallies the ballot and marks an open debate completed. The winner is the side
 * with more spectator votes. Returns null when the debate is not in voting or
 * was resolved by someone else first.
 */
export async function resolveDebateWithTally(
  debateId: string,
): Promise<DebateResolution | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("debates")
    .select(
      "id, candidate_a_id, candidate_b_id, status, election_id, election_question_id, district_id",
    )
    .eq("id", debateId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.status !== "voting") return null;

  const { raw, weighted, verifiedBallots, districtOcdId } = await tallyBallots(admin, data);

  let winnerId: string | null = null;
  if (weighted.a > weighted.b) winnerId = data.candidate_a_id;
  else if (weighted.b > weighted.a) winnerId = data.candidate_b_id;

  const loserId = winnerId
    ? loserIdFor(winnerId, data.candidate_a_id, data.candidate_b_id)
    : null;
  const priorRecords =
    winnerId && loserId ? await loadRecords(admin, [winnerId, loserId]) : null;

  const { data: saved, error: updateError } = await admin
    .from("debates")
    .update({
      status: "completed",
      candidate_a_votes: raw.a,
      candidate_b_votes: raw.b,
      candidate_a_weighted_votes: weighted.a,
      candidate_b_weighted_votes: weighted.b,
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

  const summary = formatTally(raw, weighted);
  console.info(
    `[Resolve] Debate ${saved.id} ${summary} (${verifiedBallots} verified constituent ballot(s)${
      districtOcdId ? ` in ${districtOcdId}` : ", no district resolved, all ballots weight 1"
    })`,
  );

  return {
    id: saved.id,
    winnerId,
    districtOcdId,
    raw,
    weighted,
    verifiedBallots,
    summary,
  };
}

/** Same as `resolveDebateWithTally`, returning only the debate id. */
export async function resolveDebate(debateId: string): Promise<string | null> {
  return (await resolveDebateWithTally(debateId))?.id ?? null;
}
