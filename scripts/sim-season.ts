/**
 * Run a batch of simulated debates so the leaderboards have real data.
 *
 * For each random pair of `sim-*` bots that have never debated each other:
 *   1. open a debate on a banked election question (or a generic topic),
 *   2. write an opening argument and a counter-argument (no waiting),
 *   3. move it straight to `voting` and cast 3-5 ballots from other bots,
 *   4. resolve it with resolveDebate() from lib/actions/debate-resolution.ts,
 *      which completes the debate, picks the winner, and applies Elo.
 * Win/loss records come from the candidate_stats view, which counts completed
 * debates, so they update as a result.
 *
 * The winner is drawn with the Elo expected-score odds, so upsets happen but
 * favorites win more often.
 *
 *   npm run sim:season                 # 12 debates
 *   npm run sim:season -- --count 15   # 1-15 debates
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * No AI key is required.
 */

import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

for (const path of [".env.local", ".env"]) {
  if (existsSync(path)) loadDotenv({ path, override: false });
}

type Db = SupabaseClient;

type Bot = { id: string; username: string; elo: number };

type Question = {
  id: string;
  election_id: string;
  prompt: string;
};

type ElectionRow = { id: string; district_id: string | null };

const FALLBACK_TOPICS = [
  "Should the city fund transit before widening highways?",
  "Should federal grants require zoning reform for housing money?",
  "Should the state expand early voting hours?",
  "Should Congress raise the cap on Pell grants?",
  "Should local police budgets shift toward crisis responders?",
  "Should Texas build more transmission lines across the grid?",
];

const OPENINGS = [
  "The evidence points one way on this, and the cost of waiting is paid by residents every year we delay.",
  "This is a question of priorities. Public money should go where it produces measurable results for the district.",
  "Voters were promised action on this. A clear, funded plan is better than another study.",
  "We can protect what works and still fix what does not. The proposal does exactly that.",
];

const COUNTERS = [
  "That framing skips the tradeoffs. The plan costs more than advertised and the benefits arrive too late.",
  "Good intentions do not make a policy. Without accountability, the money will not reach the people it is meant for.",
  "The district needs a narrower, cheaper fix first. Scaling up before proving it works is how programs fail.",
  "I agree on the goal and disagree on the method. This approach hands too much power to the wrong hands.",
];

function flag(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function fail(message: string): never {
  throw new Error(message);
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function pairKey(left: string, right: string) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function expectedScore(rating: number, opponent: number) {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

async function loadBots(db: Db): Promise<Bot[]> {
  const { data, error } = await db.from("users").select("id, username, elo_rating").ilike("username", "sim-%");
  if (error) fail(`Could not load sim bots: ${error.message}`);
  return ((data ?? []) as { id: string; username: string; elo_rating: number | null }[]).map((row) => ({
    id: row.id,
    username: row.username,
    elo: row.elo_rating ?? 1200,
  }));
}

async function freshPairs(db: Db, bots: Bot[]) {
  const { data, error } = await db.from("debates").select("candidate_a_id, candidate_b_id");
  if (error) fail(`Could not read past debates: ${error.message}`);
  const seen = new Set(
    ((data ?? []) as { candidate_a_id: string | null; candidate_b_id: string | null }[])
      .filter((row) => row.candidate_a_id && row.candidate_b_id)
      .map((row) => pairKey(row.candidate_a_id as string, row.candidate_b_id as string)),
  );

  const pairs: [Bot, Bot][] = [];
  for (let i = 0; i < bots.length; i += 1) {
    for (let j = i + 1; j < bots.length; j += 1) {
      if (!seen.has(pairKey(bots[i].id, bots[j].id))) pairs.push([bots[i], bots[j]]);
    }
  }
  return shuffle(pairs);
}

async function loadTopics(db: Db) {
  const [questions, elections] = await Promise.all([
    db.from("election_questions").select("id, election_id, prompt").limit(200),
    db.from("elections").select("id, district_id"),
  ]);
  return {
    questions: questions.error ? ([] as Question[]) : ((questions.data ?? []) as Question[]),
    elections: new Map(
      ((elections.error ? [] : (elections.data ?? [])) as ElectionRow[]).map((row) => [row.id, row]),
    ),
  };
}

async function currentElo(db: Db, id: string) {
  const { data, error } = await db.from("users").select("elo_rating").eq("id", id).maybeSingle();
  if (error) fail(`Could not read Elo: ${error.message}`);
  return (data as { elo_rating: number | null } | null)?.elo_rating ?? 1200;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");

  const countFlag = flag("--count");
  const count = countFlag == null ? 12 : Number(countFlag);
  if (!Number.isInteger(count) || count < 1 || count > 15) fail("--count must be a whole number from 1 to 15.");

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const bots = await loadBots(db);
  if (bots.length < 5) fail(`Only ${bots.length} sim bots found. Run \`npm run arena:sim\` to seed more.`);

  const pairs = (await freshPairs(db, bots)).slice(0, count);
  if (pairs.length === 0) fail("Every sim bot pair has already debated.");
  if (pairs.length < count) console.log(`[Season] Only ${pairs.length} fresh pairs left.`);

  const { resolveDebate } = await import("@/lib/actions/debate-resolution");
  const { questions, elections } = await loadTopics(db);
  const startElo = new Map(bots.map((bot) => [bot.id, bot.elo]));

  console.log(`[Season] Simulating ${pairs.length} debates between ${bots.length} bots.`);
  console.log();

  let resolved = 0;
  for (const [first, second] of pairs) {
    const [botA, botB] = Math.random() < 0.5 ? [first, second] : [second, first];
    const question = questions.length > 0 ? pick(questions) : null;
    const topic = question?.prompt ?? pick(FALLBACK_TOPICS);
    const election = question ? elections.get(question.election_id) : null;

    const created = await db
      .from("debates")
      .insert({
        topic,
        candidate_a_id: botA.id,
        candidate_b_id: botB.id,
        election_id: question?.election_id ?? null,
        election_question_id: question?.id ?? null,
        district_id: election?.district_id ?? null,
        status: "voting",
        current_round: 1,
      })
      .select("id")
      .single();
    if (created.error || !created.data) {
      console.warn(`[Season] Skipped ${botA.username} vs ${botB.username}: ${created.error?.message}`);
      continue;
    }
    const debateId = created.data.id as string;

    try {
      const opening = pick(OPENINGS);
      const counter = pick(COUNTERS);
      const args = await db.from("arguments").insert([
        { debate_id: debateId, author_id: botA.id, round_number: 1, content: opening },
        { debate_id: debateId, author_id: botB.id, round_number: 1, content: counter },
      ]);
      if (args.error) throw new Error(`arguments: ${args.error.message}`);
      // Mirror columns are optional on older databases.
      await db.from("debates").update({ candidate_a_argument: opening, candidate_b_argument: counter }).eq("id", debateId);

      const eloA = await currentElo(db, botA.id);
      const eloB = await currentElo(db, botB.id);
      const winnerIsA = Math.random() < expectedScore(eloA, eloB);
      const ballots = 3 + Math.floor(Math.random() * 3);
      const minMajority = Math.floor(ballots / 2) + 1;
      const majority = minMajority + Math.floor(Math.random() * (Math.max(minMajority, ballots - 1) - minMajority + 1));

      const voters = shuffle(bots.filter((bot) => bot.id !== botA.id && bot.id !== botB.id)).slice(0, ballots);
      const rows = voters.map((voter, index) => ({
        debate_id: debateId,
        voter_id: voter.id,
        candidate_id: (index < majority ? winnerIsA : !winnerIsA) ? botA.id : botB.id,
      }));
      const votes = await db.from("votes").insert(rows);
      if (votes.error) throw new Error(`votes: ${votes.error.message}`);

      const resolvedId = await resolveDebate(debateId);
      if (!resolvedId) throw new Error("resolveDebate did not complete the debate");

      const after = await db.from("debates").select("winner_id, candidate_a_votes, candidate_b_votes").eq("id", debateId).single();
      const nextA = await currentElo(db, botA.id);
      const nextB = await currentElo(db, botB.id);
      const row = after.data as { winner_id: string | null; candidate_a_votes: number; candidate_b_votes: number } | null;
      const winner = row?.winner_id === botA.id ? "A" : row?.winner_id === botB.id ? "B" : "tie";
      console.log(
        `[Season] ${botA.username} ${eloA}->${nextA} vs ${botB.username} ${eloB}->${nextB}  ` +
          `${row?.candidate_a_votes ?? 0}-${row?.candidate_b_votes ?? 0} winner ${winner}`,
      );
      resolved += 1;
    } catch (error) {
      // Do not leave a half-built debate stuck in voting.
      await db.from("debates").delete().eq("id", debateId);
      console.warn(`[Season] ${botA.username} vs ${botB.username} failed and was removed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log();
  console.log(`[Season] Resolved ${resolved} of ${pairs.length} debates.`);

  const { data: standings, error } = await db
    .from("candidate_stats")
    .select("id, username, elo_rating, debates_won, debates_played")
    .gt("debates_played", 0)
    .order("elo_rating", { ascending: false })
    .limit(10);
  if (!error) {
    console.log("[Season] Top 10 by Elo:");
    for (const row of (standings ?? []) as { id: string; username: string; elo_rating: number; debates_won: number; debates_played: number }[]) {
      const before = startElo.get(row.id);
      const delta = before == null ? "" : ` (${row.elo_rating - before >= 0 ? "+" : ""}${row.elo_rating - before})`;
      console.log(
        `[Season]   ${row.username.padEnd(28)} ${row.elo_rating}${delta}  ${row.debates_won}-${row.debates_played - row.debates_won}`,
      );
    }
  }
  console.log("[Season] Refresh /leaderboards to see the board.");
}

main().catch((error) => {
  console.error(`[Season] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
