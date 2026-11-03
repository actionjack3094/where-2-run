/**
 * Lena Ortiz and Caleb Nguyen on the TX-10 Democratic primary.
 * Requires the profile campaign columns from
 * supabase/migrations/20261027160000_tx10_candidate_profiles.sql.
 *
 *   npm run seed:tx10
 */

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createAdminClient } from "@/lib/db/supabase-admin";

const CANDIDATES = [
  {
    id: "c1111111-1111-1111-1111-111111111111",
    email: "lena.ortiz.tx10@seed.where2run.local",
    full_name: "Lena Ortiz",
    party: "Democratic",
    office: "U.S. House · TX-10 Primary",
    candidate_stage: "CONTENDER",
    ideology_x: -0.52,
    ideology_y: 0.41,
    voting_zip_code: "78701",
    district_votes: 38,
    escrow_pledged: 1850,
    escrow_target: 3125,
  },
  {
    id: "c2222222-2222-2222-2222-222222222222",
    email: "caleb.nguyen.tx10@seed.where2run.local",
    full_name: "Caleb Nguyen",
    party: "Democratic",
    office: "U.S. House · TX-10 Primary",
    candidate_stage: "PROSPECTIVE",
    ideology_x: -0.31,
    ideology_y: 0.15,
    voting_zip_code: "78701",
    district_votes: 14,
    escrow_pledged: 450,
    escrow_target: 3125,
  },
] as const;

function loadEnv() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) loadDotenv({ path, override: false });
  }
}

async function main() {
  loadEnv();
  const admin = createAdminClient();
  for (const row of CANDIDATES) {
    const saved = await admin.from("profiles").upsert(
      {
        ...row,
        display_name: row.full_name,
        legal_name: row.full_name,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (saved.error) throw new Error(`${row.full_name}: ${saved.error.message}`);
    console.log(`[TX-10] ${row.full_name} · ${row.id}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
