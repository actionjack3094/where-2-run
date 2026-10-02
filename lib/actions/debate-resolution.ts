import { calculateDebateElo } from "@/lib/actions/elo";
import { evaluateDebateTranscript } from "@/lib/ai/judge";
import { lookupUserEmail } from "@/lib/actions/email";
import { parseElo } from "@/lib/arena/elo";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { resend } from "@/lib/email/client";
import { formatTally, type Tally } from "@/lib/vote-weight";

type AdminClient = ReturnType<typeof createAdminClient>;

type DebateRecord = {
  id: string;
  debates_won: number | null;
  debates_played: number | null;
};

type DebateRow = {
  id: string;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
  status: string;
  election_id: string | null;
  election_question_id: string | null;
  district_id: string | null;
  expires_at: string | null;
  elo_applied_at: string | null;
  winner_id: string | null;
  candidate_a_votes: number | null;
  candidate_b_votes: number | null;
  candidate_a_weighted_votes: number | null;
  candidate_b_weighted_votes: number | null;
};

const PAGE_SIZE = 1000;
const DEFAULT_RATING = 1200;

/** Floors whose match timer can close the debate. */
const TIMER_STATUSES = new Set(["in_progress", "active", "voting", "matching"]);

/**
 * Official resolution trigger.
 * A debate is due when its status is `concluded`, or when the match timer
 * has expired while the floor is still open.
 * Spectator rows in `debate_votes` are not a trigger and are not a ballot.
 */
export function isOfficialResolutionDue(
  debate: { status: string; expires_at: string | null },
  now = Date.now(),
) {
  if (debate.status === "concluded") return true;
  if (!TIMER_STATUSES.has(debate.status) || !debate.expires_at) return false;
  const expires = Date.parse(debate.expires_at);
  return Number.isFinite(expires) && expires <= now;
}

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

/** Official `votes` rows for the two seated candidates. Does not read `debate_votes`. */
async function loadOfficialBallots(
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

function storedOutcome(debate: DebateRow) {
  const raw: Tally = {
    a: Math.max(0, debate.candidate_a_votes ?? 0),
    b: Math.max(0, debate.candidate_b_votes ?? 0),
  };
  const storedWeighted: Tally = {
    a: Math.max(0, debate.candidate_a_weighted_votes ?? 0),
    b: Math.max(0, debate.candidate_b_weighted_votes ?? 0),
  };
  const hasMargin = raw.a + raw.b > 0 || storedWeighted.a + storedWeighted.b > 0;
  if (!hasMargin && !debate.winner_id) return null;

  const weighted = storedWeighted.a + storedWeighted.b > 0 ? storedWeighted : { ...raw };
  let winnerId = debate.winner_id;
  if (!winnerId) {
    if (weighted.a > weighted.b) winnerId = debate.candidate_a_id;
    else if (weighted.b > weighted.a) winnerId = debate.candidate_b_id;
  }

  return { raw, weighted, winnerId };
}

async function tallyOfficialBallots(admin: AdminClient, debate: DebateRow) {
  const seated = [debate.candidate_a_id, debate.candidate_b_id].filter(
    (id): id is string => Boolean(id),
  );
  const ballots = seated.length > 0 ? await loadOfficialBallots(admin, debate.id, seated) : [];
  const raw: Tally = { a: 0, b: 0 };
  for (const ballot of ballots) {
    const side = ballot.candidate_id === debate.candidate_a_id ? "a" : "b";
    raw[side] += 1;
  }

  let winnerId: string | null = null;
  if (raw.a > raw.b) winnerId = debate.candidate_a_id;
  else if (raw.b > raw.a) winnerId = debate.candidate_b_id;

  return { raw, weighted: { ...raw }, winnerId };
}

/** Margin passed to calculateDebateElo. A stored winner with an empty tally is 1–0. */
function eloMargin(
  winnerId: string | null,
  candidateAId: string,
  candidateBId: string,
  raw: Tally,
  weighted: Tally,
) {
  const votesA = weighted.a + weighted.b > 0 ? weighted.a : raw.a;
  const votesB = weighted.a + weighted.b > 0 ? weighted.b : raw.b;
  if (votesA + votesB > 0) return { votesA, votesB };
  if (winnerId === candidateAId) return { votesA: 1, votesB: 0 };
  if (winnerId === candidateBId) return { votesA: 0, votesB: 1 };
  return { votesA: 0, votesB: 0 };
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

async function tournamentElectionId(admin: AdminClient, debate: DebateRow) {
  if (debate.election_id) return debate.election_id;
  if (!debate.election_question_id) return null;
  const { data, error } = await admin
    .from("election_questions")
    .select("election_id")
    .eq("id", debate.election_question_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { election_id: string | null } | null)?.election_id ?? null;
}

async function loadStoredRatings(
  admin: AdminClient,
  electionId: string | null,
  candidateAId: string,
  candidateBId: string,
) {
  const ids = [candidateAId, candidateBId];
  const { data, error } = await admin
    .from("users")
    .select("id, elo_rating")
    .in("id", ids);
  if (error) throw new Error(error.message);

  const global = new Map<string, number>();
  for (const row of (data ?? []) as { id: string; elo_rating: number | null }[]) {
    global.set(row.id, parseElo(row.elo_rating));
  }

  const tournament = new Map<string, { rating: number; matchesPlayed: number }>();
  if (electionId) {
    const { data: rows, error: tournamentError } = await admin
      .from("tournament_participants")
      .select("user_id, elo_rating, matches_played")
      .eq("election_id", electionId)
      .in("user_id", ids);
    if (tournamentError) throw new Error(tournamentError.message);
    for (const row of (rows ?? []) as {
      user_id: string;
      elo_rating: number;
      matches_played: number;
    }[]) {
      tournament.set(row.user_id, {
        rating: parseElo(row.elo_rating),
        matchesPlayed: row.matches_played,
      });
    }
  }

  function ratingFor(userId: string) {
    return tournament.get(userId)?.rating ?? global.get(userId) ?? DEFAULT_RATING;
  }

  return { ratingFor, tournament };
}

async function persistRating(
  admin: AdminClient,
  userId: string,
  electionId: string | null,
  newRating: number,
  priorMatches: number | null,
  now: string,
) {
  const { error } = await admin
    .from("users")
    .update({ elo_rating: newRating, updated_at: now })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  if (!electionId) return;

  if (priorMatches == null) {
    const { error: insertError } = await admin.from("tournament_participants").insert({
      user_id: userId,
      election_id: electionId,
      elo_rating: newRating,
      matches_played: 1,
    });
    if (insertError) throw new Error(insertError.message);
    return;
  }

  const { error: updateError } = await admin
    .from("tournament_participants")
    .update({
      elo_rating: newRating,
      matches_played: priorMatches + 1,
    })
    .eq("user_id", userId)
    .eq("election_id", electionId);
  if (updateError) throw new Error(updateError.message);
}

function signedDelta(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

async function emailResolvedDebaters(
  admin: AdminClient,
  input: {
    debateId: string;
    candidateAId: string;
    candidateBId: string;
    winnerId: string | null;
    ratingA: number;
    ratingB: number;
    newRatingA: number;
    newRatingB: number;
    deltaA: number;
    deltaB: number;
  },
) {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from || !process.env.RESEND_API_KEY?.trim()) {
    console.error("[resend] debate resolution email skipped: missing RESEND_API_KEY or RESEND_FROM_EMAIL");
    return;
  }

  const { data, error } = await admin
    .from("users")
    .select("id, username")
    .in("id", [input.candidateAId, input.candidateBId]);
  if (error) throw new Error(error.message);

  const names = new Map(
    ((data ?? []) as { id: string; username: string | null }[]).map((row) => [
      row.id,
      row.username?.trim() || "A debater",
    ]),
  );
  const nameA = names.get(input.candidateAId) ?? "Candidate A";
  const nameB = names.get(input.candidateBId) ?? "Candidate B";
  const outcome =
    input.winnerId === input.candidateAId
      ? `${nameA} won.`
      : input.winnerId === input.candidateBId
        ? `${nameB} won.`
        : "The match ended in a tie.";
  const text = [
    `Debate ${input.debateId} is resolved.`,
    outcome,
    `${nameA}: Elo ${input.ratingA} → ${input.newRatingA} (${signedDelta(input.deltaA)})`,
    `${nameB}: Elo ${input.ratingB} → ${input.newRatingB} (${signedDelta(input.deltaB)})`,
  ].join("\n");

  const addresses = await Promise.all([
    lookupUserEmail(input.candidateAId),
    lookupUserEmail(input.candidateBId),
  ]);
  const recipients = [...new Set(addresses.filter((email): email is string => Boolean(email)))];
  if (recipients.length === 0) {
    console.error(`[resend] debate ${input.debateId} has no debater email addresses.`);
    return;
  }

  await Promise.all(
    recipients.map(async (to) => {
      const { error: sendError } = await resend.emails.send({
        from,
        to,
        subject: "Your debate is resolved",
        text,
      });
      if (sendError) {
        console.error(`[resend] debate resolution email to ${to} failed: ${sendError.message}`);
      }
    }),
  );
}

/**
 * Resolves a debate whose status is `concluded`, whose match timer has
 * expired, or whose voting window is being closed explicitly.
 * A stored winner_id is used as-is. When the row has no predefined winner,
 * the transcript is graded by evaluateDebateTranscript and that winner_id
 * drives Elo. `debate_votes` is spectator telemetry and is not read.
 * Returns null when the debate is not due or was resolved by someone else first.
 */
export async function resolveDebateWithTally(
  debateId: string,
): Promise<DebateResolution | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("debates")
    .select(
      "id, candidate_a_id, candidate_b_id, status, election_id, election_question_id, district_id, expires_at, elo_applied_at, winner_id, candidate_a_votes, candidate_b_votes, candidate_a_weighted_votes, candidate_b_weighted_votes",
    )
    .eq("id", debateId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const debate = data as DebateRow | null;
  if (!debate || debate.status === "resolved" || debate.elo_applied_at) return null;
  if (debate.status !== "voting" && !isOfficialResolutionDue(debate)) return null;
  if (!debate.candidate_a_id || !debate.candidate_b_id) return null;

  const candidateAId = debate.candidate_a_id;
  const candidateBId = debate.candidate_b_id;
  const districtOcdId = await debateDistrictOcdId(admin, debate);
  const outcome = storedOutcome(debate) ?? (await tallyOfficialBallots(admin, debate));
  const { raw, weighted } = outcome;
  let winnerId = debate.winner_id ? outcome.winnerId : null;
  let judgeReasoning: string | null = null;

  if (!debate.winner_id) {
    const verdict = await evaluateDebateTranscript(debate.id);
    judgeReasoning = verdict.judge_reasoning;
    winnerId =
      verdict.winner_id === candidateAId || verdict.winner_id === candidateBId
        ? verdict.winner_id
        : null;
  }

  const margin = eloMargin(
    winnerId,
    candidateAId,
    candidateBId,
    debate.winner_id ? raw : { a: 0, b: 0 },
    debate.winner_id ? weighted : { a: 0, b: 0 },
  );

  const electionId = await tournamentElectionId(admin, debate);
  const ratings = await loadStoredRatings(admin, electionId, candidateAId, candidateBId);
  const ratingA = ratings.ratingFor(candidateAId);
  const ratingB = ratings.ratingFor(candidateBId);
  const next = calculateDebateElo(
    { userId: candidateAId, rating: ratingA },
    { userId: candidateBId, rating: ratingB },
    margin,
  );

  const loserId = winnerId ? loserIdFor(winnerId, candidateAId, candidateBId) : null;
  const priorRecords =
    winnerId && loserId ? await loadRecords(admin, [winnerId, loserId]) : null;

  const resolvedAt = new Date().toISOString();
  const { data: saved, error: updateError } = await admin
    .from("debates")
    .update({
      status: "resolved",
      resolved_at: resolvedAt,
      elo_applied_at: resolvedAt,
      candidate_a_votes: raw.a,
      candidate_b_votes: raw.b,
      candidate_a_weighted_votes: weighted.a,
      candidate_b_weighted_votes: weighted.b,
      winner_id: winnerId,
      ...(judgeReasoning ? { judge_reasoning: judgeReasoning } : {}),
    })
    .eq("id", debateId)
    .eq("status", debate.status)
    .is("elo_applied_at", null)
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!saved) return null;

  await persistRating(
    admin,
    candidateAId,
    electionId,
    next.newRatingA,
    ratings.tournament.get(candidateAId)?.matchesPlayed ?? null,
    resolvedAt,
  );
  await persistRating(
    admin,
    candidateBId,
    electionId,
    next.newRatingB,
    ratings.tournament.get(candidateBId)?.matchesPlayed ?? null,
    resolvedAt,
  );

  if (winnerId && loserId && priorRecords) {
    await incrementMatchRecord(admin, winnerId, loserId, priorRecords);
  }

  const summary = formatTally(raw, weighted);
  console.info(
    `[Resolve] Debate ${saved.id} ${summary} ratings ${ratingA}->${next.newRatingA} (${next.deltaA >= 0 ? "+" : ""}${next.deltaA}) / ${ratingB}->${next.newRatingB} (${next.deltaB >= 0 ? "+" : ""}${next.deltaB})`,
  );

  try {
    await emailResolvedDebaters(admin, {
      debateId: saved.id,
      candidateAId,
      candidateBId,
      winnerId,
      ratingA,
      ratingB,
      newRatingA: next.newRatingA,
      newRatingB: next.newRatingB,
      deltaA: next.deltaA,
      deltaB: next.deltaB,
    });
  } catch (caught) {
    console.error("[resend] debate resolution email threw.", caught);
  }

  return {
    id: saved.id,
    winnerId,
    districtOcdId,
    raw,
    weighted,
    verifiedBallots: 0,
    summary,
  };
}

/** Same as `resolveDebateWithTally`, returning only the debate id. */
export async function resolveDebate(debateId: string): Promise<string | null> {
  return (await resolveDebateWithTally(debateId))?.id ?? null;
}
