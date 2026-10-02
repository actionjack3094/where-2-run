import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { TEST_PASSWORD, type TestUser } from "./helpers";

const TX37_OCD = "ocd-division/country:us/state:tx/cd:37";
const STANCE = "[0.2000,0.1000,-0.2000,0.4000,0.3000,0.0000]";
export const JURY_ROLLBACK_STREAK = 1;
export const JURY_ROLLBACK_PLEDGE_AMOUNT = 25;

export type SeededAccount = TestUser & {
  id: string;
  username: string;
};

export type JuryRollbackFixture = {
  debateId: string;
  electionId: string;
  districtOcdId: string;
  candidateA: SeededAccount;
  candidateB: SeededAccount;
  constituent: SeededAccount;
};

function loadEnv() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) loadDotenv({ path, override: false });
  }
}

function admin(): SupabaseClient {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fail(message: string): never {
  throw new Error(message);
}

function stamp() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function createAccount(
  db: SupabaseClient,
  role: string,
  ocdId: string,
  options: { verified?: boolean; matched?: boolean } = {},
): Promise<SeededAccount> {
  const suffix = stamp();
  const email = `e2e.jury.${role}.${suffix}@example.com`;
  const username = `e2e-${role}-${suffix}`.slice(0, 40);
  const password = TEST_PASSWORD;

  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: username },
  });
  if (created.error || !created.data.user) {
    fail(`Could not create ${role}: ${created.error?.message ?? "no user"}`);
  }

  const id = created.data.user.id;
  const ocdIds = [ocdId];
  const { error: profileError } = await db.from("users").insert({
    id,
    username,
    home_ocd_ids: ocdIds,
    matched_ocd_ids: options.matched === false ? [] : ocdIds,
    ocd_identifiers: ocdIds,
    stance_vector: STANCE,
    tier_2_verified: Boolean(options.verified),
    is_verified: Boolean(options.verified),
  });
  if (profileError) fail(`Could not insert ${role} profile: ${profileError.message}`);

  return { id, email, password, username };
}

async function loadTx37Election(db: SupabaseClient) {
  const { data, error } = await db
    .from("elections")
    .select("id, ocd_id, district_id")
    .eq("ocd_id", TX37_OCD)
    .maybeSingle();
  if (error) fail(`Could not load the TX-37 election: ${error.message}`);
  if (!data?.id) fail("Seeded U.S. House Texas District 37 election is missing.");
  return {
    id: data.id as string,
    ocdId: (data.ocd_id as string | null) ?? TX37_OCD,
    districtId: (data.district_id as string | null) ?? null,
  };
}

/**
 * Completed debate with Candidate A as winner, streak 1/10, and a $25 pending pledge.
 */
export async function seedCompletedDebateWithAlignmentStreak(): Promise<JuryRollbackFixture> {
  const db = admin();
  const election = await loadTx37Election(db);
  const ocdId = election.ocdId;

  const candidateA = await createAccount(db, "a", ocdId, { matched: true });
  const candidateB = await createAccount(db, "b", ocdId, { matched: true });
  const constituent = await createAccount(db, "voter", ocdId, { verified: true });

  const sealedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: debate, error: debateError } = await db
    .from("debates")
    .insert({
      topic: "E2E jury rollback: should this seeded district outcome stand?",
      status: "completed",
      election_id: election.id,
      district_id: election.districtId,
      candidate_a_id: candidateA.id,
      candidate_b_id: candidateB.id,
      winner_id: candidateA.id,
      candidate_a_votes: 5,
      candidate_b_votes: 2,
      candidate_a_weighted_votes: 9,
      candidate_b_weighted_votes: 2,
      current_round: 3,
      elo_applied_at: sealedAt,
      expires_at: sealedAt,
    })
    .select("id")
    .single();
  if (debateError || !debate) {
    fail(`Could not seed the completed debate: ${debateError?.message ?? "no row"}`);
  }

  const { error: targetError } = await db.from("campaign_targets").insert({
    user_id: candidateA.id,
    election_id: election.id,
    status: "exploring",
    alignment_streak: JURY_ROLLBACK_STREAK,
  });
  if (targetError) fail(`Could not seed the alignment streak: ${targetError.message}`);

  const { error: pledgeError } = await db.from("campaign_pledges").insert({
    donor_id: constituent.id,
    candidate_id: candidateA.id,
    election_id: election.id,
    debate_id: debate.id,
    amount: JURY_ROLLBACK_PLEDGE_AMOUNT,
    unlock_condition: "alignment_streak_10",
    status: "pending",
  });
  if (pledgeError) fail(`Could not seed the pending pledge: ${pledgeError.message}`);

  return {
    debateId: debate.id as string,
    electionId: election.id,
    districtOcdId: ocdId,
    candidateA,
    candidateB,
    constituent,
  };
}
