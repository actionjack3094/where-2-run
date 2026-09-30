/**
 * Resolve a debate that is in the "voting" stage, on demand, for local testing.
 *
 * In production an hourly pg_cron job closes expired debates. Locally you would
 * wait 24 hours, so this script runs the same pipeline immediately:
 *
 *   1. Cast 3-5 simulated jury ballots from sim-* personas (or other seed users).
 *   2. Tally the ballots (verified constituents of the debate's district count 3x,
 *      everyone else 1) and mark the debate `completed` with a winner
 *      (lib/actions/debate-resolution.ts, the same code the debate page runs
 *      when the 24-hour timer lapses). That calls apply_debate_elo().
 *   3. Nudge each candidate's ideology vector with update_ideology_vector_ema(),
 *      using the six-axis stance read from their own arguments.
 *   4. Run calibrate_district_alignment() so alignment_streak moves for the
 *      human candidate(s).
 *
 *   npm run debate:resolve                         # newest debate in voting
 *   npm run debate:resolve -- <debate-uuid>        # a specific debate
 *   npm run debate:resolve -- --winner b --votes 3
 *   npm run debate:resolve -- --no-calibrate       # leave matched_ocd_ids alone
 *
 * Flags:
 *   --debate <uuid>   same as the positional argument
 *   --votes <3-5>     simulated ballots to cast (default 5)
 *   --winner <a|b>    force the simulated majority (default random)
 *   --no-calibrate    skip calibrate_district_alignment. That function can eject
 *                     a district from matched_ocd_ids when similarity < 0.85.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * No AI key is required.
 */

import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

function loadEnv() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) loadDotenv({ path, override: false });
  }
}

// Env has to be loaded before the lib modules read process.env.
loadEnv();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX37_OCD_ID = "ocd-division/country:us/state:tx/cd:37";
const ALIGNMENT_THRESHOLD = 0.85;

type Db = SupabaseClient;

type DebateRow = {
  id: string;
  topic: string;
  status: string;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
  election_id: string | null;
  election_question_id: string | null;
  winner_id: string | null;
  candidate_a_votes: number | null;
  candidate_b_votes: number | null;
  created_at: string;
};

type UserRow = {
  id: string;
  username: string;
  elo_rating: number | null;
  ideology_vector: unknown;
  matched_ocd_ids: string[] | null;
};

type Snapshot = {
  elo: number;
  streak: number;
  distance: number | null;
  matched: string[];
};

function flag(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function positionalDebateId() {
  return process.argv.slice(2).find((arg) => UUID.test(arg)) ?? null;
}

function log(message = "") {
  console.log(message);
}

function isSim(username: string | null | undefined) {
  return Boolean(username?.trim().toLowerCase().startsWith("sim-"));
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function fail(message: string): never {
  throw new Error(message);
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T | null {
  if (result.error) fail(`${what}: ${result.error.message}`);
  return result.data;
}

async function pickDebate(db: Db, requestedId: string | null) {
  if (requestedId) {
    const row = must(
      await db.from("debates").select("*").eq("id", requestedId).maybeSingle(),
      "Could not load the debate",
    ) as DebateRow | null;
    if (!row) fail(`No debate with id ${requestedId}.`);
    return row;
  }

  const rows = must(
    await db
      .from("debates")
      .select("*")
      .eq("status", "voting")
      .order("created_at", { ascending: false })
      .limit(1),
    "Could not look for a voting debate",
  ) as DebateRow[] | null;
  const row = rows?.[0];
  if (!row) fail('No debate is in the "voting" stage. Finish an argument round first, or pass a debate id.');
  return row;
}

async function loadUsers(db: Db, ids: string[]) {
  const rows = must(
    await db
      .from("users")
      .select("id, username, elo_rating, ideology_vector, matched_ocd_ids")
      .in("id", ids),
    "Could not load candidate profiles",
  ) as UserRow[] | null;
  return new Map((rows ?? []).map((row) => [row.id, row]));
}

async function fetchVoters(db: Db, debate: DebateRow, needed: number) {
  const seated = [debate.candidate_a_id, debate.candidate_b_id].filter((id): id is string => Boolean(id));

  const existing = must(
    await db.from("votes").select("voter_id").eq("debate_id", debate.id),
    "Could not read existing ballots",
  ) as { voter_id: string }[] | null;
  const taken = new Set([...seated, ...(existing ?? []).map((row) => row.voter_id)]);

  const sims = must(
    await db.from("users").select("id, username").ilike("username", "sim-%").limit(200),
    "Could not load sim personas",
  ) as { id: string; username: string }[] | null;

  const pool = shuffle((sims ?? []).filter((row) => !taken.has(row.id)));

  if (pool.length < needed) {
    const others = must(
      await db.from("users").select("id, username").not("username", "ilike", "sim-%").limit(200),
      "Could not load seed users",
    ) as { id: string; username: string }[] | null;
    const known = new Set([...taken, ...pool.map((row) => row.id)]);
    pool.push(...shuffle((others ?? []).filter((row) => !known.has(row.id))));
  }

  return pool;
}

async function castSimulatedBallots(db: Db, debate: DebateRow, count: number, forcedSide: "a" | "b" | null) {
  const candidateA = debate.candidate_a_id;
  const candidateB = debate.candidate_b_id;
  if (!candidateA || !candidateB) fail("Both candidates must be seated before a debate can be resolved.");

  // One spare voter so a tie against pre-existing ballots can be broken.
  const voters = await fetchVoters(db, debate, count + 1);
  if (voters.length < 3) {
    fail(
      `Only ${voters.length} eligible voter(s) found. Seed personas with \`npm run arena:sim\` (needs an AI key) or add users, then retry.`,
    );
  }

  const ballots = Math.min(count, voters.length);
  const side = forcedSide ?? (Math.random() < 0.5 ? "a" : "b");
  const minMajority = Math.floor(ballots / 2) + 1;
  const maxMajority = Math.max(minMajority, ballots - 1);
  const majority = minMajority + Math.floor(Math.random() * (maxMajority - minMajority + 1));
  const winnerId = side === "a" ? candidateA : candidateB;
  const loserId = side === "a" ? candidateB : candidateA;

  const plan = voters.slice(0, ballots).map((voter, index) => ({
    voter,
    candidateId: index < majority ? winnerId : loserId,
  }));

  const inserted: { username: string; candidateId: string }[] = [];
  const spare = voters.slice(ballots);

  async function insertBallot(voter: { id: string; username: string }, candidateId: string) {
    const { error } = await db.from("votes").insert({
      debate_id: debate.id,
      voter_id: voter.id,
      candidate_id: candidateId,
    });
    if (error) {
      // 23505: this voter already voted. Skip rather than abort the run.
      if (error.code === "23505") return false;
      fail(`Could not cast a ballot for ${voter.username}: ${error.message}`);
    }
    inserted.push({ username: voter.username, candidateId });
    return true;
  }

  for (const entry of plan) await insertBallot(entry.voter, entry.candidateId);

  const tally = await tallyVotes(db, debate);
  if (tally.a === tally.b) {
    for (const voter of spare) {
      if (await insertBallot(voter, winnerId)) break;
    }
  }

  return inserted;
}

async function tallyVotes(db: Db, debate: DebateRow) {
  const count = async (candidateId: string | null) => {
    if (!candidateId) return 0;
    const { count: total, error } = await db
      .from("votes")
      .select("id", { count: "exact", head: true })
      .eq("debate_id", debate.id)
      .eq("candidate_id", candidateId)
      .is("voided_at", null);
    if (error) fail(`Could not tally ballots: ${error.message}`);
    return total ?? 0;
  };
  return { a: await count(debate.candidate_a_id), b: await count(debate.candidate_b_id) };
}

/** The district the debate was filed in: the election's OCD-ID, else its district id. */
async function debateDistrictRef(db: Db, debate: DebateRow) {
  let electionId = debate.election_id;
  if (debate.election_question_id) {
    const question = must(
      await db.from("election_questions").select("election_id").eq("id", debate.election_question_id).maybeSingle(),
      "Could not load the election question",
    ) as { election_id: string | null } | null;
    electionId = question?.election_id ?? electionId;
  }
  if (electionId) {
    const election = must(
      await db.from("elections").select("ocd_id, district_id").eq("id", electionId).maybeSingle(),
      "Could not load the election",
    ) as { ocd_id: string | null; district_id: string | null } | null;
    const ref = election?.ocd_id ?? election?.district_id ?? null;
    if (ref) return ref;
  }
  return null;
}

type DistrictRow = { id: string; name: string | null; ocd_id: string | null; median_ideology_vector: unknown };

/**
 * TX-37 is found by OCD-ID when the districts table carries one, and otherwise
 * by name ("U.S. House Texas District 37"), which is how the local seed stores it.
 */
async function loadTx37(db: Db): Promise<DistrictRow | null> {
  const byOcd = await db
    .from("districts")
    .select("id, name, ocd_id, median_ideology_vector")
    .eq("ocd_id", TX37_OCD_ID)
    .limit(1)
    .maybeSingle();
  if (!byOcd.error && byOcd.data) return byOcd.data as DistrictRow;

  const byName = await db
    .from("districts")
    .select("id, name, ocd_id, median_ideology_vector")
    .ilike("name", "%Texas District 37%")
    .limit(1)
    .maybeSingle();
  return byName.error ? null : ((byName.data as DistrictRow | null) ?? null);
}

async function alignmentStreak(db: Db, userId: string) {
  const { data, error } = await db.from("campaign_targets").select("alignment_streak").eq("user_id", userId);
  if (error) return 0;
  return Math.max(0, ...((data ?? []) as { alignment_streak: number | null }[]).map((row) => row.alignment_streak ?? 0));
}

async function snapshot(db: Db, userId: string, centroid: unknown): Promise<Snapshot> {
  const { cosineSimilarity, parseVector } = await import("@/lib/ideology/vector");
  const { cosineSixAxis, toSixAxisVector } = await import("@/lib/ideology/six-axis");

  const user = (await loadUsers(db, [userId])).get(userId);
  const vector = parseVector(user?.ideology_vector);
  const center = parseVector(centroid);

  let distance: number | null = null;
  if (vector.length > 0 && center.length > 0) {
    // pgvector <=> is cosine distance. Same-length vectors match the database exactly;
    // otherwise compare in the shared six-axis space.
    distance =
      vector.length === center.length
        ? 1 - cosineSimilarity(vector, center)
        : 1 - cosineSixAxis(toSixAxisVector(vector), toSixAxisVector(center));
  }

  return {
    elo: user?.elo_rating ?? 1200,
    streak: await alignmentStreak(db, userId),
    distance,
    matched: user?.matched_ocd_ids ?? [],
  };
}

async function applyEma(db: Db, debate: DebateRow, candidateId: string) {
  const [{ inferSixAxisFromText }, { formatSixAxisVector }, { IDEOLOGY_EMA_ALPHA }] = await Promise.all([
    import("@/lib/feed/assign-election"),
    import("@/lib/ideology/six-axis"),
    import("@/lib/feed/types"),
  ]);

  const rows = must(
    await db.from("arguments").select("content").eq("debate_id", debate.id).eq("author_id", candidateId),
    "Could not read arguments",
  ) as { content: string }[] | null;
  const text = [debate.topic, ...(rows ?? []).map((row) => row.content)].join("\n");

  const { error } = await db.rpc("update_ideology_vector_ema", {
    p_user_id: candidateId,
    p_stance_vector: formatSixAxisVector(inferSixAxisFromText(text)),
    p_alpha: IDEOLOGY_EMA_ALPHA,
  });
  return error?.message ?? null;
}

function fmtDistance(value: number | null) {
  return value == null ? "n/a" : value.toFixed(4);
}

function arrow(before: number, after: number) {
  const delta = after - before;
  return `${before} -> ${after} (${delta >= 0 ? "+" : ""}${delta})`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const requested = flag("--debate") ?? positionalDebateId();
  if (requested && !UUID.test(requested)) fail(`"${requested}" is not a valid debate id.`);

  const votesFlag = flag("--votes");
  const voteCount = votesFlag == null ? 5 : Number(votesFlag);
  if (!Number.isInteger(voteCount) || voteCount < 3 || voteCount > 5) fail("--votes must be a whole number from 3 to 5.");

  const winnerFlag = flag("--winner")?.toLowerCase() ?? null;
  if (winnerFlag && winnerFlag !== "a" && winnerFlag !== "b") fail("--winner must be a or b.");

  const debate = await pickDebate(db, requested);
  if (debate.status !== "voting") {
    fail(
      `Debate ${debate.id} is "${debate.status}", not "voting". ${
        debate.status === "completed" ? "It is already resolved." : "Only voting debates can be resolved."
      }`,
    );
  }
  if (!debate.candidate_a_id || !debate.candidate_b_id) fail("Both candidates must be seated to resolve a debate.");

  const candidateIds = [debate.candidate_a_id, debate.candidate_b_id];
  const before = await loadUsers(db, candidateIds);
  const nameOf = (id: string | null) => before.get(id ?? "")?.username ?? id?.slice(0, 8) ?? "unknown";
  const humans = candidateIds.filter((id) => !isSim(before.get(id)?.username));
  const tracked = humans.length > 0 ? humans : candidateIds;

  log(`[Resolve] Debate ${debate.id}`);
  log(`[Resolve] "${debate.topic.slice(0, 100)}"`);
  log(`[Resolve] A: ${nameOf(debate.candidate_a_id)}   B: ${nameOf(debate.candidate_b_id)}`);

  const tx37 = await loadTx37(db);
  const centroid = tx37?.median_ideology_vector ?? null;
  const snapshotsBefore = new Map<string, Snapshot>();
  for (const id of candidateIds) snapshotsBefore.set(id, await snapshot(db, id, centroid));

  // 1. Simulated jury ballots.
  const ballots = await castSimulatedBallots(db, debate, voteCount, (winnerFlag as "a" | "b" | null) ?? null);
  log();
  log(`[Jury] Cast ${ballots.length} simulated ballot(s):`);
  for (const ballot of ballots) {
    log(`[Jury]   ${ballot.username.padEnd(28)} -> ${ballot.candidateId === debate.candidate_a_id ? "A" : "B"} (${nameOf(ballot.candidateId)})`);
  }

  // 2. Resolve: completed status, winner, tallies, and apply_debate_elo().
  const { resolveDebateWithTally } = await import("@/lib/actions/debate-resolution");
  const resolution = await resolveDebateWithTally(debate.id);
  if (!resolution) fail("The debate was not resolved. It may have left the voting stage while the script ran.");

  const after = must(
    await db.from("debates").select("*").eq("id", debate.id).maybeSingle(),
    "Could not reload the debate",
  ) as DebateRow | null;
  if (!after) fail("The debate disappeared after resolution.");

  // 3. Ideology vector EMA for both candidates.
  const emaWarnings: string[] = [];
  for (const id of candidateIds) {
    const message = await applyEma(db, debate, id);
    if (message) emaWarnings.push(`${nameOf(id)}: ${message}`);
  }

  // 4. Alignment streak via the district calibration function.
  const calibrateEnabled = !hasFlag("--no-calibrate");
  const districtRef = (await debateDistrictRef(db, debate)) ?? tx37?.id ?? TX37_OCD_ID;
  const calibrationNotes: string[] = [];
  const releaseLines: string[] = [];
  if (calibrateEnabled) {
    const { releaseForReachedStreaks } = await import("@/lib/actions/pledge-release");
    for (const id of tracked) {
      // Returns one { target_election_id, new_streak } row per target it incremented.
      const { data, error } = await db.rpc("calibrate_district_alignment", {
        p_user_id: id,
        p_district_id: districtRef,
      });
      if (error) {
        calibrationNotes.push(`${nameOf(id)}: ${error.message}`);
        continue;
      }

      // new_streak >= 10: release this candidate's alignment_streak_10 pledges.
      try {
        const releases = await releaseForReachedStreaks(
          id,
          data as { target_election_id: string; new_streak: number }[] | null,
        );
        for (const release of releases) {
          releaseLines.push(
            `${nameOf(id)}: streak ${release.newStreak} on election ${release.electionId.slice(0, 8)}, released ${release.released} pledge(s) ($${release.releasedAmount})`,
          );
        }
      } catch (caught) {
        calibrationNotes.push(
          `${nameOf(id)} escrow release: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    }
  }

  const { raw, weighted } = resolution;
  const winnerId = after.winner_id;
  const afterUsers = await loadUsers(db, candidateIds);

  log();
  log("[Tally] ------------------------------------------");
  log(`[Tally] Candidate A  ${nameOf(debate.candidate_a_id).padEnd(24)} ${raw.a} raw, ${weighted.a}w weighted`);
  log(`[Tally] Candidate B  ${nameOf(debate.candidate_b_id).padEnd(24)} ${raw.b} raw, ${weighted.b}w weighted`);
  log(`[Tally] ${resolution.summary}`);
  log(
    `[Tally] ${resolution.verifiedBallots} verified constituent ballot(s) counted 3x in ${resolution.districtOcdId ?? "no district (all ballots weight 1)"}`,
  );
  log(
    winnerId
      ? `[Winner] ${winnerId === debate.candidate_a_id ? "Candidate A" : "Candidate B"}: ${nameOf(winnerId)}`
      : "[Winner] Tie. No winner declared, Elo unchanged.",
  );
  log(`[Status] ${debate.status} -> ${after.status}`);

  log();
  log("[Elo]");
  for (const id of candidateIds) {
    const prior = snapshotsBefore.get(id)?.elo ?? 1200;
    const next = afterUsers.get(id)?.elo_rating ?? prior;
    const role = id === winnerId ? "winner" : winnerId ? "loser " : "tie   ";
    log(`[Elo]   ${role} ${nameOf(id).padEnd(28)} ${arrow(prior, next)}`);
  }

  const record = await db
    .from("candidate_stats")
    .select("id, debates_won, debates_played")
    .in("id", candidateIds);
  if (!record.error) {
    log();
    for (const row of (record.data ?? []) as { id: string; debates_won: number; debates_played: number }[]) {
      log(`[Record] ${nameOf(row.id).padEnd(28)} ${row.debates_won}W - ${Math.max(0, row.debates_played - row.debates_won)}L (${row.debates_played} played)`);
    }
  }

  log();
  log(`[Alignment] TX-37 centroid: ${tx37 ? (tx37.name ?? tx37.id) : "not found in districts"}`);
  if (calibrateEnabled) log(`[Alignment] calibrated against: ${districtRef}`);
  for (const id of tracked) {
    const prior = snapshotsBefore.get(id);
    const next = await snapshot(db, id, centroid);
    log(`[Alignment] ${nameOf(id)}`);
    log(`[Alignment]   alignment_streak  ${arrow(prior?.streak ?? 0, next.streak)}`);
    log(`[Alignment]   cosine distance   ${fmtDistance(prior?.distance ?? null)} -> ${fmtDistance(next.distance)} (streak counts at similarity >= ${ALIGNMENT_THRESHOLD}, distance <= ${(1 - ALIGNMENT_THRESHOLD).toFixed(2)})`);
    const targets = await db
      .from("campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", id);
    if (!targets.error && (targets.count ?? 0) === 0) {
      log("[Alignment]   no campaign_targets rows, so there is no streak to grow. Target a race first.");
    }
    const ejected = (prior?.matched ?? []).filter((ocd) => !next.matched.includes(ocd));
    if (ejected.length > 0) log(`[Alignment]   matched_ocd_ids ejected: ${ejected.join(", ")}`);
  }
  if (!calibrateEnabled) log("[Alignment] Calibration skipped (--no-calibrate).");
  for (const line of releaseLines) log(`[Escrow] ${line}`);

  for (const note of calibrationNotes) console.warn(`[Warn] calibrate_district_alignment ${note}`);
  for (const note of emaWarnings) console.warn(`[Warn] update_ideology_vector_ema ${note}`);

  log();
  log(`[Done] Open /debates/${debate.id} to see the finished debate.`);
}

main().catch((error) => {
  console.error(`[Resolve] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
