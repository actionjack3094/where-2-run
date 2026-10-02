/**
 * Seed AI candidate personas onto empty district boards.
 *
 * Each persona gets a stable 3-axis stance (economic, social, governance) in
 * [-1, 1], stored as the 6D pgvector `users.stance_vector` and as
 * `user_ideologies.vector_data`. Campaign targets are locked and accumulating
 * on the elections for that district's OCD-ID.
 *
 *   npm run seed:bots
 *
 * Reads .env.local. Requires NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. Re-running updates the same bot accounts.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  calibrateAxisStance,
  formatPgAxisStance,
  type AxisStance,
} from "@/lib/ideology/axes";

const BOARDS = [
  {
    ocdId: "ocd-division/country:us/state:tx/cd:37",
    label: "Texas CD-37",
  },
  {
    ocdId: "ocd-division/country:us/state:tx/cd:10",
    label: "Texas CD-10",
  },
  {
    ocdId: "ocd-division/country:us/state:mi/cd:7",
    label: "Michigan CD-7",
  },
  {
    ocdId: "ocd-division/country:us/state:tx/place:austin/council_district:9",
    label: "Austin Council 9",
  },
] as const;

const NAMES = [
  "Ada Pell",
  "Noah Briggs",
  "Lila Ortiz",
  "Samir Shah",
  "Brooke Hale",
  "Evan Cho",
  "Priya Nand",
  "Cole Merritt",
  "June Alvarez",
  "Malik Reed",
  "Tess Okonkwo",
  "Harper Quinn",
  "Diego Santos",
  "Ruth Klein",
  "Owen Blake",
  "Mina Farouk",
] as const;

type Persona = {
  slug: string;
  name: string;
  ocdId: string;
  board: string;
  stance: AxisStance;
  elo: number;
};

function loadEnv() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) loadDotenv({ path, override: false });
  }
}

function slugOf(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function unitFromHash(slug: string, salt: string) {
  const hex = createHash("sha256").update(`where2run-seed-bot:${salt}:${slug}`).digest("hex");
  const roll = Number.parseInt(hex.slice(0, 8), 16) / 0xffffffff;
  return roll * 2 - 1;
}

function personaUserId(slug: string) {
  const hex = createHash("sha256").update(`where2run-seed-bot:${slug}`).digest("hex").slice(0, 32);
  const variant = ((Number.parseInt(hex[16] ?? "8", 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function buildPersonas(): Persona[] {
  return NAMES.map((name, index) => {
    const board = BOARDS[index % BOARDS.length];
    const slug = slugOf(name);
    const stance = calibrateAxisStance({
      economic: unitFromHash(slug, "economic"),
      social: unitFromHash(slug, "social"),
      governance: unitFromHash(slug, "governance"),
    });
    const eloRoll = Math.abs(unitFromHash(slug, "elo"));
    return {
      slug,
      name,
      ocdId: board.ocdId,
      board: board.label,
      stance,
      elo: 1080 + Math.round(eloRoll * 440),
    };
  });
}

function ideologyLiteral(stance: AxisStance) {
  const unit = (value: number) => ((value + 1) / 2).toFixed(6);
  const axes = [unit(stance.economic), unit(stance.social), unit(stance.governance)];
  const rest = Array.from({ length: 7 }, () => "0.500000");
  return `[${[...axes, ...rest].join(",")}]`;
}

function isDuplicate(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "23505" || /already been registered|already exists|duplicate key/i.test(message);
}

function isMissingUser(error: { message?: string; status?: number; code?: string } | null | undefined) {
  if (!error) return false;
  return error.status === 404 || error.code === "user_not_found" || /not found/i.test(error.message ?? "");
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  for (let page = 1; page <= 10; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw new Error(listed.error.message);
    const match = listed.data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (listed.data.users.length < 200) return null;
  }
  return null;
}

async function ensureAuthUser(admin: ReturnType<typeof createAdminClient>, persona: Persona) {
  const userId = personaUserId(persona.slug);
  const email = `ai+${persona.slug}@where2run.dev`;
  const existing = await admin.auth.admin.getUserById(userId);
  if (existing.data.user) return existing.data.user.id;
  if (existing.error && !isMissingUser(existing.error)) {
    throw new Error(existing.error.message);
  }

  const created = await admin.auth.admin.createUser({
    id: userId,
    email,
    password: process.env.SEED_BOT_PASSWORD ?? "seed-bot-local-only",
    email_confirm: true,
    user_metadata: {
      full_name: persona.name,
      bot: true,
      account_kind: "ai",
    },
  });

  if (!created.error && created.data.user) return created.data.user.id;
  if (created.error && isDuplicate(created.error)) {
    const found = await findAuthUserIdByEmail(admin, email);
    if (found) return found;
  }
  throw new Error(created.error?.message ?? `Could not create ${persona.name}.`);
}

async function main() {
  loadEnv();
  const admin = createAdminClient();
  const personas = buildPersonas();

  const [districtsQuery, electionsQuery] = await Promise.all([
    admin.from("districts").select("id, ocd_id"),
    admin.from("elections").select("id, ocd_id, district_id, office_name"),
  ]);
  if (districtsQuery.error) throw new Error(districtsQuery.error.message);
  if (electionsQuery.error) throw new Error(electionsQuery.error.message);

  const districtByOcd = new Map<string, string>();
  for (const row of districtsQuery.data ?? []) {
    const ocdId = row.ocd_id?.trim().toLowerCase();
    if (ocdId) districtByOcd.set(ocdId, row.id);
  }

  const elections = electionsQuery.data ?? [];

  for (const persona of personas) {
    const userId = await ensureAuthUser(admin, persona);
    const ocdKey = persona.ocdId.toLowerCase();
    const districtId = districtByOcd.get(ocdKey) ?? null;
    const stanceVector = formatPgAxisStance(persona.stance);
    const now = new Date().toISOString();

    const profile = await admin.from("users").upsert(
      {
        id: userId,
        username: `ai-${persona.slug}`,
        tier: "ai",
        elo_rating: persona.elo,
        stance_vector: stanceVector,
        ideology_vector: ideologyLiteral(persona.stance),
        target_district_id: districtId,
        home_ocd_ids: [persona.ocdId],
        matched_ocd_ids: [persona.ocdId],
        ocd_identifiers: [persona.ocdId],
        is_verified: false,
        verification_tier: "unverified",
        updated_at: now,
      },
      { onConflict: "id" },
    );
    if (profile.error) throw new Error(`${persona.name}: ${profile.error.message}`);

    const ideology = await admin.from("user_ideologies").upsert(
      {
        user_id: userId,
        vector_data: persona.stance,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
    if (ideology.error) throw new Error(`${persona.name}: ${ideology.error.message}`);

    const seats = elections.filter((election) => {
      if (election.ocd_id?.trim().toLowerCase() === ocdKey) return true;
      return Boolean(districtId && election.district_id === districtId);
    });

    if (seats.length === 0) {
      console.log(
        `[Bots] ${persona.name} · ${persona.board} · no election for ${persona.ocdId}`,
      );
      continue;
    }

    const targets = await admin.from("campaign_targets").upsert(
      seats.map((election) => ({
        user_id: userId,
        election_id: election.id,
        status: "filed",
        is_locked: true,
        escrow_status: "accumulating",
        alignment_streak: 10,
      })),
      { onConflict: "user_id,election_id" },
    );
    if (targets.error) throw new Error(`${persona.name}: ${targets.error.message}`);

    const axes = formatPgAxisStance(persona.stance);
    console.log(
      `[Bots] ${persona.name} · ${persona.board} · elo ${persona.elo} · ${axes} · ${seats.length} locked race${seats.length === 1 ? "" : "s"}`,
    );
  }

  console.log(`[Bots] Seeded ${personas.length} AI candidates.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Seed failed.";
  console.error(message);
  process.exitCode = 1;
});
