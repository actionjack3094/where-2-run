/**
 * Populate the district arrays that drive the civic feed.
 *
 * Targets the most recently signed-in real account by default (bots named
 * arena-sim+*@ are skipped). Override with --user <uuid | email | username>.
 *
 *   npm run feed:patch
 *   npm run feed:patch -- --user jackson.sanfacon3094@gmail.com
 *
 * Equivalent SQL, for the Supabase SQL editor:
 *
 *   update public.users set
 *     home_ocd_ids    = array['ocd-division/country:us/state:tx/cd:37',
 *                             'ocd-division/country:us/state:tx/place:austin/council_district:9'],
 *     matched_ocd_ids = array['ocd-division/country:us/state:tx/cd:37',
 *                             'ocd-division/country:us/state:tx/place:austin/council_district:9'],
 *     ideology_vector = coalesce(ideology_vector, '[0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5]'::vector(10))
 *   where id = '<user uuid>';
 *
 * users.ideology_vector is vector(10), so the neutral default is ten 0.5s.
 * It is only written when the column is NULL.
 */

import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

const FEED_OCD_IDS = [
  "ocd-division/country:us/state:tx/cd:37",
  "ocd-division/country:us/state:tx/place:austin/council_district:9",
] as const;

const NEUTRAL_IDEOLOGY_VECTOR = `[${Array.from({ length: 10 }, () => "0.500000").join(",")}]`;

function loadEnv() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) loadDotenv({ path, override: false });
  }
}

function flag(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const wanted = flag("--user");

  let userId: string | null = null;
  let label = "";

  if (wanted && UUID.test(wanted)) {
    userId = wanted;
    label = wanted;
  } else {
    const listed = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listed.error) throw new Error(listed.error.message);
    const real = listed.data.users.filter((user) => !(user.email ?? "").startsWith("arena-sim+"));

    if (wanted) {
      const needle = wanted.toLowerCase();
      const byEmail = real.find((user) => user.email?.toLowerCase() === needle);
      if (byEmail) {
        userId = byEmail.id;
        label = byEmail.email ?? byEmail.id;
      } else {
        const byName = await db.from("users").select("id, username").eq("username", wanted).maybeSingle();
        if (byName.error) throw new Error(byName.error.message);
        userId = (byName.data?.id as string | undefined) ?? null;
        label = wanted;
      }
    } else {
      const latest = [...real].sort((left, right) =>
        (right.last_sign_in_at ?? "").localeCompare(left.last_sign_in_at ?? ""),
      )[0];
      userId = latest?.id ?? null;
      label = latest?.email ?? latest?.id ?? "";
    }
  }

  if (!userId) throw new Error(`No user found${wanted ? ` for "${wanted}"` : ""}.`);

  const before = await db
    .from("users")
    .select("id, username, home_ocd_ids, matched_ocd_ids, ideology_vector")
    .eq("id", userId)
    .maybeSingle();
  if (before.error) throw new Error(before.error.message);
  if (!before.data) throw new Error(`${label} has no row in public.users.`);

  const patch: Record<string, unknown> = {
    home_ocd_ids: [...FEED_OCD_IDS],
    matched_ocd_ids: [...FEED_OCD_IDS],
  };
  const initializedVector = before.data.ideology_vector == null;
  if (initializedVector) patch.ideology_vector = NEUTRAL_IDEOLOGY_VECTOR;

  const updated = await db.from("users").update(patch).eq("id", userId).select("username, home_ocd_ids, matched_ocd_ids").maybeSingle();
  if (updated.error) throw new Error(updated.error.message);

  console.log(`[Patch] ${label} (${before.data.username})`);
  console.log(`[Patch] home_ocd_ids    ${JSON.stringify(before.data.home_ocd_ids)} -> ${JSON.stringify(updated.data?.home_ocd_ids)}`);
  console.log(`[Patch] matched_ocd_ids ${JSON.stringify(before.data.matched_ocd_ids)} -> ${JSON.stringify(updated.data?.matched_ocd_ids)}`);
  console.log(
    `[Patch] ideology_vector ${initializedVector ? "was NULL, set to neutral 10-axis default" : "already set, left unchanged"}`,
  );
}

main().catch((error) => {
  console.error(`[Patch] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
