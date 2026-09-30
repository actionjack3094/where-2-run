/**
 * Simulate a successful jury appeal: three verified constituents vote to
 * overturn, then resolveJuryAppeal rolls back Elo, alignment streak, and escrow.
 *
 *   npm run jury:test -- --setup                      # fixture + overturn
 *   npm run jury:test -- <appeal-uuid>                # existing pending appeal
 *   npm run jury:test -- --setup --debate <uuid>
 *
 * --setup completes a local debate with both candidates seated, applies a known
 * Elo swing, sets the winner's streak to 10, plants a released pledge, files
 * the appeal, then casts the three overturn votes.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

function loadEnv() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) loadDotenv({ path, override: false });
  }
}

loadEnv();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETUP_WINNER_ELO = 1520;
const SETUP_LOSER_ELO = 1270;
const SETUP_STREAK = 10;
const SETUP_PLEDGE_AMOUNT = 50;

type Db = SupabaseClient;

type DebateRow = {
  id: string;
  topic: string;
  status: string;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
  election_id: string | null;
  election_question_id: string | null;
  district_id: string | null;
  winner_id: string | null;
  elo_applied_at: string | null;
  candidate_a_votes: number | null;
  candidate_b_votes: number | null;
};

function flag(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function positionalId() {
  return process.argv.slice(2).find((arg) => UUID.test(arg)) ?? null;
}

function fail(message: string): never {
  throw new Error(message);
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T | null {
  if (result.error) fail(`${what}: ${result.error.message}`);
  return result.data;
}

function asOcdIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function normalizeOcd(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function log(message = "") {
  console.log(message);
}

async function pickSetupDebate(db: Db, requestedId: string | null) {
  if (requestedId) return loadDebate(db, requestedId);

  const completed = must(
    await db
      .from("debates")
      .select("*")
      .eq("status", "completed")
      .not("candidate_a_id", "is", null)
      .not("candidate_b_id", "is", null)
      .not("winner_id", "is", null)
      .not("election_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1),
    "Could not look for a completed debate",
  ) as DebateRow[] | null;
  if (completed?.[0]) return completed[0];

  const seated = must(
    await db
      .from("debates")
      .select("*")
      .not("candidate_a_id", "is", null)
      .not("candidate_b_id", "is", null)
      .not("election_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1),
    "Could not look for a seated debate",
  ) as DebateRow[] | null;
  if (seated?.[0]) return seated[0];

  fail("No debate with both candidates seated. Pass --debate <uuid>.");
}

async function loadDebate(db: Db, debateId: string) {
  const row = must(
    await db.from("debates").select("*").eq("id", debateId).maybeSingle(),
    "Could not load the debate",
  ) as DebateRow | null;
  if (!row) fail(`No debate with id ${debateId}.`);
  return row;
}

async function debateOcdId(db: Db, debate: DebateRow) {
  const { debateDistrictOcdId } = await import("@/lib/actions/debate-resolution");
  return debateDistrictOcdId(db as never, debate);
}

async function ensureVerified(db: Db, userId: string, ocdId: string) {
  const existing = must(
    await db.from("tier2_verifications").select("ocd_ids").eq("user_id", userId).maybeSingle(),
    "Could not read tier2_verifications",
  ) as { ocd_ids: unknown } | null;
  const ids = asOcdIds(existing?.ocd_ids);
  const wanted = normalizeOcd(ocdId);
  if (ids.some((id) => normalizeOcd(id) === wanted)) return;

  const next = [...ids, ocdId];
  if (existing) {
    const { error } = await db.from("tier2_verifications").update({ ocd_ids: next }).eq("user_id", userId);
    if (error) fail(`Could not update verification for ${userId}: ${error.message}`);
    return;
  }

  const { error } = await db.from("tier2_verifications").insert({
    user_id: userId,
    verified_address: "test-jury-appeal",
    ocd_ids: next,
  });
  if (error) fail(`Could not insert verification for ${userId}: ${error.message}`);
}

async function pickConstituents(
  db: Db,
  debate: DebateRow,
  ocdId: string,
  needed: number,
  extraBlocked: Iterable<string> = [],
) {
  const blocked = new Set(
    [
      debate.candidate_a_id,
      debate.candidate_b_id,
      ...extraBlocked,
    ].filter((id): id is string => Boolean(id)),
  );
  const rows = must(
    await db.from("users").select("id, username").order("username").limit(50),
    "Could not load users",
  ) as { id: string; username: string }[] | null;
  const pool = (rows ?? []).filter((row) => !blocked.has(row.id));
  if (pool.length < needed) {
    fail(`Need ${needed} non-candidate users to sit as appellant/jurors, found ${pool.length}.`);
  }

  const chosen = pool.slice(0, needed);
  for (const user of chosen) await ensureVerified(db, user.id, ocdId);
  return chosen;
}

async function snapshotCandidate(db: Db, userId: string, electionId: string | null) {
  const user = must(
    await db.from("users").select("id, username, elo_rating").eq("id", userId).maybeSingle(),
    "Could not load candidate",
  ) as { id: string; username: string; elo_rating: number | null } | null;

  let streak = 0;
  if (electionId) {
    const target = must(
      await db
        .from("campaign_targets")
        .select("alignment_streak")
        .eq("user_id", userId)
        .eq("election_id", electionId)
        .maybeSingle(),
      "Could not load campaign target",
    ) as { alignment_streak: number | null } | null;
    streak = target?.alignment_streak ?? 0;
  }

  let released = 0;
  let releasedAmount = 0;
  if (electionId) {
    const pledges = must(
      await db
        .from("campaign_pledges")
        .select("amount")
        .eq("candidate_id", userId)
        .eq("election_id", electionId)
        .eq("status", "released"),
      "Could not load pledges",
    ) as { amount: number | string }[] | null;
    released = pledges?.length ?? 0;
    releasedAmount = (pledges ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  }

  return {
    id: userId,
    username: user?.username ?? userId.slice(0, 8),
    elo: user?.elo_rating ?? 1200,
    streak,
    released,
    releasedAmount,
  };
}

async function setupFixture(db: Db, requestedId: string | null) {
  const debate = await pickSetupDebate(db, requestedId);
  if (!debate.candidate_a_id || !debate.candidate_b_id) {
    fail("Both candidates must be seated before an appeal can be simulated.");
  }
  if (!debate.election_id) fail("The debate must be tied to an election so escrow can be planted.");

  const winnerId = debate.candidate_a_id;
  const loserId = debate.candidate_b_id;
  const ocdId = await debateOcdId(db, debate);
  if (!ocdId) fail("Could not resolve the debate's district OCD-ID.");

  const appeals = must(
    await db.from("jury_appeals").select("id").eq("debate_id", debate.id),
    "Could not list existing appeals",
  ) as { id: string }[] | null;
  const appealIds = (appeals ?? []).map((row) => row.id);
  if (appealIds.length > 0) {
    await db.from("jury_verdicts").delete().in("appeal_id", appealIds);
    await db.from("jury_appeals").delete().eq("debate_id", debate.id);
  }

  const { error: debateError } = await db
    .from("debates")
    .update({
      status: "completed",
      winner_id: winnerId,
      candidate_a_votes: 5,
      candidate_b_votes: 2,
      candidate_a_weighted_votes: 9,
      candidate_b_weighted_votes: 2,
      elo_applied_at: new Date().toISOString(),
    })
    .eq("id", debate.id);
  if (debateError) fail(`Could not complete the debate: ${debateError.message}`);

  const { error: winnerEloError } = await db
    .from("users")
    .update({ elo_rating: SETUP_WINNER_ELO, updated_at: new Date().toISOString() })
    .eq("id", winnerId);
  if (winnerEloError) fail(`Could not set winner Elo: ${winnerEloError.message}`);
  const { error: loserEloError } = await db
    .from("users")
    .update({ elo_rating: SETUP_LOSER_ELO, updated_at: new Date().toISOString() })
    .eq("id", loserId);
  if (loserEloError) fail(`Could not set loser Elo: ${loserEloError.message}`);

  const { error: targetError } = await db.from("campaign_targets").upsert(
    {
      user_id: winnerId,
      election_id: debate.election_id,
      status: "exploring",
      alignment_streak: SETUP_STREAK,
    },
    { onConflict: "user_id,election_id" },
  );
  if (targetError) fail(`Could not set alignment streak: ${targetError.message}`);

  const existingPledge = must(
    await db
      .from("campaign_pledges")
      .select("id")
      .eq("candidate_id", winnerId)
      .eq("election_id", debate.election_id)
      .eq("status", "released")
      .limit(1)
      .maybeSingle(),
    "Could not look for a released pledge",
  );
  if (!existingPledge) {
    const seated = new Set([winnerId, loserId]);
    const donors = must(
      await db.from("users").select("id").order("username").limit(20),
      "Could not load a donor",
    ) as { id: string }[] | null;
    const donorId = (donors ?? []).find((row) => !seated.has(row.id))?.id;
    if (!donorId) fail("Need a third user to plant a released pledge.");
    const { error: pledgeError } = await db.from("campaign_pledges").insert({
      donor_id: donorId,
      candidate_id: winnerId,
      election_id: debate.election_id,
      amount: SETUP_PLEDGE_AMOUNT,
      unlock_condition: "alignment_streak_10",
      debate_id: debate.id,
      status: "released",
    });
    if (pledgeError) fail(`Could not plant a released pledge: ${pledgeError.message}`);
  }

  const seats = await pickConstituents(db, { ...debate, winner_id: winnerId }, ocdId, 4);
  const appellant = seats[0]!;
  const jurors = seats.slice(1, 4);

  const { data: appeal, error: appealError } = await db
    .from("jury_appeals")
    .insert({
      debate_id: debate.id,
      appellant_id: appellant.id,
      reason: "Simulated jury appeal: the weighted tally does not match the district.",
      status: "pending",
    })
    .select("id")
    .single();
  if (appealError || !appeal) fail(`Could not file the appeal: ${appealError?.message ?? "no row"}`);

  log(`[Setup] Debate ${debate.id}`);
  log(`[Setup] Winner Elo ${SETUP_WINNER_ELO}, loser Elo ${SETUP_LOSER_ELO}, streak ${SETUP_STREAK}`);
  log(`[Setup] Appeal ${appeal.id} filed by ${appellant.username}`);
  return { appealId: appeal.id as string, jurors, ocdId };
}

async function loadAppeal(db: Db, appealId: string) {
  const row = must(
    await db
      .from("jury_appeals")
      .select("id, debate_id, appellant_id, status")
      .eq("id", appealId)
      .maybeSingle(),
    "Could not load the appeal",
  ) as { id: string; debate_id: string; appellant_id: string | null; status: string | null } | null;
  if (!row) fail(`No appeal with id ${appealId}.`);
  return row;
}

async function insertOverturnVerdicts(
  db: Db,
  appealId: string,
  debate: DebateRow,
  ocdId: string,
  preferredJurors?: { id: string; username: string }[],
  appellantId?: string | null,
) {
  const existing = must(
    await db.from("jury_verdicts").select("juror_id").eq("appeal_id", appealId),
    "Could not read existing verdicts",
  ) as { juror_id: string }[] | null;
  const taken = new Set((existing ?? []).map((row) => row.juror_id));
  const needed = Math.max(0, 3 - taken.size);
  if (needed === 0) return existing?.length ?? 0;

  const pool = (preferredJurors ?? []).filter(
    (row) => !taken.has(row.id) && row.id !== appellantId,
  );
  if (pool.length < needed) {
    const more = await pickConstituents(db, debate, ocdId, needed, [
      ...taken,
      ...pool.map((row) => row.id),
      appellantId ?? "",
    ]);
    pool.push(...more.filter((row) => !pool.some((seat) => seat.id === row.id)));
  }
  if (pool.length < needed) fail(`Need ${needed} more juror(s); not enough verified constituents.`);

  for (const juror of pool.slice(0, needed)) {
    await ensureVerified(db, juror.id, ocdId);
    const { error } = await db.from("jury_verdicts").insert({
      appeal_id: appealId,
      juror_id: juror.id,
      overturned: true,
    });
    if (error && error.code !== "23505") {
      fail(`Could not insert a verdict for ${juror.username}: ${error.message}`);
    }
    log(`[Jury] ${juror.username.padEnd(28)} overturned = true`);
  }

  const after = must(
    await db.from("jury_verdicts").select("id").eq("appeal_id", appealId),
    "Could not recount verdicts",
  ) as { id: string }[] | null;
  return after?.length ?? 0;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const setup = hasFlag("--setup");
  const requested = flag("--debate") ?? positionalId();
  if (requested && !UUID.test(requested)) fail(`"${requested}" is not a valid id.`);

  let appealId = setup ? null : requested;
  let preferredJurors: { id: string; username: string }[] | undefined;

  if (setup) {
    const fixture = await setupFixture(db, requested && UUID.test(requested) ? requested : null);
    appealId = fixture.appealId;
    preferredJurors = fixture.jurors;
    log();
  }

  if (!appealId) {
    fail("Pass an appeal id, or run with --setup to build a local test appeal.");
  }

  const appeal = await loadAppeal(db, appealId);
  const debate = await loadDebate(db, appeal.debate_id);
  const ocdId = await debateOcdId(db, debate);
  if (!ocdId) fail("Could not resolve the debate's district OCD-ID.");

  if (appeal.appellant_id) await ensureVerified(db, appeal.appellant_id, ocdId);

  const candidateIds = [debate.candidate_a_id, debate.candidate_b_id].filter(
    (id): id is string => Boolean(id),
  );
  const before = new Map<string, Awaited<ReturnType<typeof snapshotCandidate>>>();
  for (const id of candidateIds) {
    before.set(id, await snapshotCandidate(db, id, debate.election_id));
  }

  log(`[Jury] Appeal ${appeal.id} on debate ${debate.id}`);
  log(`[Jury] "${debate.topic.slice(0, 100)}"`);
  log(`[Jury] District ${ocdId}`);

  const verdicts = await insertOverturnVerdicts(
    db,
    appeal.id,
    debate,
    ocdId,
    preferredJurors,
    appeal.appellant_id,
  );
  log(`[Jury] ${verdicts} verdict(s) on file (quorum 3)`);

  const { resolveJuryAppeal } = await import("@/lib/actions/jury-resolution");
  const result = await resolveJuryAppeal(appeal.id);
  if (!result.ok) fail(result.error);

  log();
  log(`[Resolve] status ${result.status}  (${result.overturnedVotes}/${result.verdicts} overturn)`);

  if (result.status === "pending") {
    log(`[Resolve] Below quorum (${result.verdicts}/${result.quorum}). No rollback.`);
    return;
  }

  if (result.status === "upheld") {
    log("[Resolve] Majority did not overturn. Outcome stands.");
    return;
  }

  const rollback = result.rollback;
  const afterUsers = new Map<string, Awaited<ReturnType<typeof snapshotCandidate>>>();
  for (const id of candidateIds) {
    afterUsers.set(id, await snapshotCandidate(db, id, debate.election_id));
  }

  log();
  log("[Rollback] ------------------------------------------");
  log(`[Rollback] Winner ${rollback.previousWinnerId ?? "none"} -> ${rollback.newWinnerId ?? "none"}`);
  for (const row of rollback.elo) {
    const name = before.get(row.candidateId)?.username ?? row.candidateId.slice(0, 8);
    log(`[Elo] ${row.role.padEnd(6)} ${name.padEnd(28)} ${row.from} -> ${row.to}`);
  }
  if (rollback.elo.length === 0) log("[Elo] No Elo swing was on file for this debate.");

  for (const row of rollback.streaks) {
    const name = before.get(row.candidateId)?.username ?? row.candidateId.slice(0, 8);
    log(`[Streak] ${name.padEnd(28)} ${row.from} -> ${row.to}  (election ${row.electionId.slice(0, 8)})`);
  }
  if (rollback.streaks.length === 0) log("[Streak] No campaign_targets were decremented.");

  log(
    `[Escrow] Relocked ${rollback.pledgesRelocked} pledge(s) ($${rollback.pledgesRelockedAmount}) back to pending.`,
  );

  log();
  for (const id of candidateIds) {
    const prior = before.get(id);
    const next = afterUsers.get(id);
    if (!prior || !next) continue;
    log(
      `[After] ${prior.username.padEnd(28)} Elo ${prior.elo} -> ${next.elo}   streak ${prior.streak} -> ${next.streak}   released ${prior.released} -> ${next.released}`,
    );
  }
  log();
  log(`[Done] Appeal ${appeal.id} is ${result.status}.`);
}

main().catch((error) => {
  console.error(`[Jury] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
