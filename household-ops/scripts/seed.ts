import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HOUSEHOLD_NAME = "Sanfacon Ops";
const CHANNEL_TOPIC = "Weekend Schedule & Fellowship Shift Alignment";
const PASSWORD = "password123";

const MEMBERS = [
  { email: "jackson@example.com", displayName: "Jackson", role: "User A" },
  { email: "asha@example.com", displayName: "Asha", role: "User B" },
] as const;

loadEnv(resolve(dirname(fileURLToPath(import.meta.url)), "../.env.local"));

const url = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function seed() {
  const householdId = await ensureHousehold();
  const users = await Promise.all(MEMBERS.map((member) => ensureUser(member.email)));

  for (const [index, member] of MEMBERS.entries()) {
    const user = users[index];
    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        household_id: householdId,
        role: member.role,
        display_name: member.displayName,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
  }

  const channelId = await ensureChannel(householdId);

  console.log("Seeded Sanfacon Ops");
  console.log(`Household: ${householdId}`);
  console.log(`Channel:   ${channelId}`);
  console.log("Sign in as jackson@example.com or asha@example.com / password123");
  console.log(`Open /channels/${channelId}`);
}

async function ensureHousehold() {
  const { data: existing, error: readError } = await supabase
    .from("households")
    .select("id")
    .eq("name", HOUSEHOLD_NAME)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("households")
    .insert({ name: HOUSEHOLD_NAME })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function ensureUser(email: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (!error && data.user) return data.user;

  const alreadyExists =
    error?.code === "email_exists" ||
    error?.message.toLowerCase().includes("already been registered");
  if (!alreadyExists) throw new Error(error?.message ?? `Could not create ${email}`);

  const { data: listed, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw new Error(listError.message);
  const existing = listed.users.find((user) => user.email === email);
  if (!existing) throw new Error(`Could not find existing user ${email}`);
  return existing;
}

async function ensureChannel(householdId: string) {
  const { data: existing, error: readError } = await supabase
    .from("mediation_channels")
    .select("id")
    .eq("household_id", householdId)
    .eq("topic", CHANNEL_TOPIC)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("mediation_channels")
    .insert({
      household_id: householdId,
      topic: CHANNEL_TOPIC,
      status: "open",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

function loadEnv(path: string) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}
