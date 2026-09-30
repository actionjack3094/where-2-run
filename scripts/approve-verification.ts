/**
 * Approve Tier 2 residency claims from the terminal, for local testing.
 * Stands in for the admin review screen that doesn't exist yet.
 *
 *   npm run verification:approve -- --list                 # pending claims
 *   npm run verification:approve -- <request-uuid>         # approve one
 *   npm run verification:approve -- --user <username>      # approve that user's pending claim(s)
 *
 * Approving adds the claim's district to the user's tier2_verifications.ocd_ids,
 * so their ballots in that district count 3x when a debate resolves.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * It uses the service role, so point it at production only on purpose.
 */

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";

for (const path of [".env.local", ".env"]) {
  if (existsSync(path)) loadDotenv({ path, override: false });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PendingRow = {
  id: string;
  user_id: string;
  ocd_id: string;
  document_type: string;
  created_at: string;
  users: { username: string | null } | { username: string | null }[] | null;
};

function usernameOf(row: PendingRow) {
  const user = Array.isArray(row.users) ? row.users[0] : row.users;
  return user?.username ?? row.user_id.slice(0, 8);
}

async function main() {
  const { createAdminClient } = await import("@/lib/db/supabase-admin");
  const { approveTier2Verification } = await import("@/lib/verification-admin");
  const admin = createAdminClient();

  const args = process.argv.slice(2);
  const userIndex = args.indexOf("--user");
  const username = userIndex >= 0 ? (args[userIndex + 1] ?? null) : null;
  const requestId = args.find((arg) => UUID.test(arg)) ?? null;

  const { data, error } = await admin
    .from("tier2_verification_requests")
    .select("id, user_id, ocd_id, document_type, created_at, users(username)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const pending = (data ?? []) as unknown as PendingRow[];

  if (args.includes("--list") || (!requestId && !username)) {
    if (pending.length === 0) console.log("[Verify] No pending requests.");
    for (const row of pending) {
      console.log(`[Verify] ${row.id}  ${usernameOf(row).padEnd(24)} ${row.ocd_id}  (${row.document_type})`);
    }
    if (!args.includes("--list")) {
      console.log("[Verify] Pass a request id or --user <username> to approve.");
    }
    return;
  }

  const targets = requestId
    ? [{ id: requestId, label: requestId }]
    : pending
        .filter((row) => usernameOf(row).toLowerCase() === username!.toLowerCase())
        .map((row) => ({ id: row.id, label: `${usernameOf(row)} / ${row.ocd_id}` }));

  if (targets.length === 0) {
    throw new Error(`No pending request found for "${username}". Run with --list to see what is pending.`);
  }

  for (const target of targets) {
    const result = await approveTier2Verification(target.id);
    console.log(
      result.changed
        ? `[Verify] Approved ${target.label}: verified for ${result.ocdIds.length} division(s), including ${result.ocdId}.`
        : `[Verify] ${target.label} was already approved. No change.`,
    );
  }
}

main().catch((error) => {
  console.error(`[Verify] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
