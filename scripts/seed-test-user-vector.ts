/**
 * One-off: file a known ideology vector and voting ZIP on the active test accounts
 * so Matched Primaries and My Voter Ballot can be checked while signed in.
 *
 *   npx tsx scripts/seed-test-user-vector.ts
 */

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createAdminClient } from "@/lib/db/supabase-admin";

const VECTOR = {
  ideology_x: -0.45,
  ideology_y: 0.35,
  voting_zip_code: "78701",
} as const;

function loadEnv() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) loadDotenv({ path, override: false });
  }
}

function matchesEmail(email: string | null | undefined) {
  const value = email?.trim().toLowerCase() ?? "";
  return value.includes("actionjack") || value.includes("owen.briggs");
}

async function main() {
  loadEnv();
  const admin = createAdminClient();

  const ids = new Set<string>();

  const byUsername = await admin
    .from("users")
    .select("id, username")
    .or("username.eq.actionjack3094,username.ilike.%actionjack%,username.ilike.%owen.briggs%");
  if (byUsername.error) throw new Error(byUsername.error.message);
  for (const row of byUsername.data ?? []) ids.add(row.id);

  const byProfileEmail = await admin.from("profiles").select("id, email").or("email.ilike.%actionjack%,email.ilike.%owen.briggs%");
  if (byProfileEmail.error) throw new Error(byProfileEmail.error.message);
  for (const row of byProfileEmail.data ?? []) ids.add(row.id);

  let page = 1;
  for (;;) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw new Error(listed.error.message);
    const batch = listed.data.users ?? [];
    for (const user of batch) {
      if (matchesEmail(user.email)) ids.add(user.id);
    }
    if (batch.length < 200) break;
    page += 1;
  }

  if (ids.size === 0) {
    console.log("No profiles matched actionjack3094, actionjack, or owen.briggs.");
    return;
  }

  const idList = [...ids];
  let updated = await admin
    .from("profiles")
    .update(VECTOR)
    .in("id", idList)
    .select("id, email, ideology_x, ideology_y, voting_zip_code");
  if (updated.error) throw new Error(updated.error.message);

  let confidenceNote = "confidence_score was not written.";
  const asPercent = await admin.from("profiles").update({ confidence_score: 78 }).in("id", idList).select("id");
  if (!asPercent.error) {
    confidenceNote = "confidence_score stored as 78.";
  } else if (/check constraint|confidence_score_range/i.test(asPercent.error.message)) {
    const asUnit = await admin.from("profiles").update({ confidence_score: 0.78 }).in("id", idList).select("id");
    if (asUnit.error) throw new Error(asUnit.error.message);
    confidenceNote =
      "confidence_score is constrained to 0–1, so 78 was stored as 0.78. The UI reads that as 78%.";
  } else if (/schema cache|could not find the 'confidence_score'|does not exist/i.test(asPercent.error.message)) {
    confidenceNote =
      "public.profiles has no confidence_score column in this database, so that field was left unchanged.";
  } else {
    throw new Error(asPercent.error.message);
  }

  const users = await admin.from("users").select("id, username").in("id", idList);
  if (users.error) throw new Error(users.error.message);
  const usernameById = new Map((users.data ?? []).map((row) => [row.id, row.username]));

  const verified = await admin
    .from("profiles")
    .select("id, email, ideology_x, ideology_y, voting_zip_code")
    .in("id", idList);
  if (verified.error) throw new Error(verified.error.message);

  const withConfidence = await admin
    .from("profiles")
    .select("id, confidence_score")
    .in("id", idList);
  const confidenceById = new Map(
    withConfidence.error ? [] : (withConfidence.data ?? []).map((row) => [row.id, row.confidence_score]),
  );

  const rows = (verified.data ?? []).map((row) => ({
    id: row.id,
    username: usernameById.get(row.id) ?? null,
    email: row.email,
    ideology_x: row.ideology_x,
    ideology_y: row.ideology_y,
    voting_zip_code: row.voting_zip_code,
    ...(withConfidence.error ? {} : { confidence_score: confidenceById.get(row.id) ?? null }),
  }));

  console.log(confidenceNote);
  console.log(`Updated ${rows.length} profile${rows.length === 1 ? "" : "s"}:`);
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Update failed.");
  process.exitCode = 1;
});
