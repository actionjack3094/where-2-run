import { randomUUID } from "node:crypto";
import { forfeitArenaSeat, judgeArenaExchange } from "@/lib/ai/judge";
import {
  ARENA_PUBLIC_COLUMNS,
  loadPrimaries,
  platformAdmin,
  type ArenaPublic,
  type PlatformAdmin,
} from "@/lib/platform/records";
import type { Party } from "@/lib/platform/scoring";

const DAY_MS = 24 * 60 * 60 * 1000;

type Persona = {
  key: string;
  name: string;
  party: Party;
  x: number;
  y: number;
  stance: string;
};

const PERSONAS: Persona[] = [
  {
    key: "blue-dog",
    name: "Blue Dog",
    party: "democrat",
    x: -0.28,
    y: 0.12,
    stance:
      "I want a Democratic primary that can win suburban counties: a public option, a secure border, and a narrow path to status.",
  },
  {
    key: "progressive",
    name: "Progressive",
    party: "democrat",
    x: -0.86,
    y: -0.72,
    stance:
      "I want Medicare for All, stronger unions, and civil-rights statutes with real enforcement.",
  },
  {
    key: "main-street",
    name: "Main Street",
    party: "republican",
    x: 0.34,
    y: 0.22,
    stance:
      "I want lower taxes for small employers, a secure border, and abortion policy set by the states.",
  },
  {
    key: "movement",
    name: "Movement Conservative",
    party: "republican",
    x: 0.82,
    y: 0.74,
    stance:
      "I want deep spending cuts, traditional standards in schools, and a much smaller federal code.",
  },
];

async function ensurePersona(admin: PlatformAdmin, persona: Persona) {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("synthetic_key", persona.key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.id) return data.id as string;

  const email = `synthetic+${persona.key}@where2run.local`;
  const created = await admin.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: persona.name },
  });
  if (created.error || !created.data.user) {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = listed.data.users.find((user) => user.email === email);
    if (!existing) {
      throw new Error(created.error?.message ?? "Could not seed a synthetic debater.");
    }
    const userId = existing.id;
    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      email,
      full_name: persona.name,
      display_name: persona.name,
      ideology_x: persona.x,
      ideology_y: persona.y,
      onboarding_completed: true,
      is_verified: false,
      is_synthetic: true,
      synthetic_key: persona.key,
      candidate_tier: "pundit",
      updated_at: new Date().toISOString(),
    });
    if (profileError) throw new Error(profileError.message);
    return userId;
  }
  const userId = created.data.user.id;
  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: persona.name,
    display_name: persona.name,
    ideology_x: persona.x,
    ideology_y: persona.y,
    onboarding_completed: true,
    is_verified: false,
    is_synthetic: true,
    synthetic_key: persona.key,
    candidate_tier: "pundit",
    updated_at: new Date().toISOString(),
  });
  if (profileError) throw new Error(profileError.message);
  return userId;
}

function closestPersona(party: string, x: number, y: number) {
  const pool = PERSONAS.filter((persona) => persona.party === party);
  return pool.sort(
    (a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2),
  )[0];
}

export async function ensureColdStart() {
  const admin = platformAdmin();
  const ids = new Map<string, string>();
  for (const persona of PERSONAS) {
    ids.set(persona.key, await ensurePersona(admin, persona));
  }

  const primaries = await loadPrimaries(admin);
  for (const primary of primaries) {
    const { count, error } = await admin
      .from("arena_debates")
      .select("id", { count: "exact", head: true })
      .eq("primary_id", primary.id)
      .eq("status", "open_challenge");
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0) continue;
    const persona = closestPersona(primary.party, primary.baseline_x, primary.baseline_y);
    const authorId = ids.get(persona.key);
    if (!authorId) continue;
    const { data: prompt, error: promptError } = await admin
      .from("debate_prompts")
      .insert({
        primary_id: primary.id,
        author_id: authorId,
        author_kind: "ai",
        prompt_text: `What should the ${primary.party === "democrat" ? "Democratic" : "Republican"} nominee for ${primary.office_name} promise first?`,
        stance_text: persona.stance,
        ideology_x: persona.x,
        ideology_y: persona.y,
        status: "open",
      })
      .select("id")
      .single();
    if (promptError) throw new Error(promptError.message);
    const { error: debateError } = await admin.from("arena_debates").insert({
      primary_id: primary.id,
      prompt_id: prompt.id,
      candidate_a_id: authorId,
      stance_a: persona.stance,
      status: "open_challenge",
    });
    if (debateError) throw new Error(debateError.message);
  }

  const staleBefore = new Date(Date.now() - DAY_MS).toISOString();
  const { data: stale, error: staleError } = await admin
    .from("arena_debates")
    .select(ARENA_PUBLIC_COLUMNS)
    .eq("status", "open_challenge")
    .is("candidate_b_id", null)
    .lt("created_at", staleBefore);
  if (staleError) throw new Error(staleError.message);

  for (const debate of (stale ?? []) as ArenaPublic[]) {
    const primary = primaries.find((row) => row.id === debate.primary_id);
    if (!primary) continue;
    const challenger = PERSONAS.filter((persona) => persona.party === primary.party).find(
      (persona) => ids.get(persona.key) !== debate.candidate_a_id,
    );
    if (!challenger) continue;
    const challengerId = ids.get(challenger.key);
    if (!challengerId) continue;
    const lock = new Date();
    const { error: claimError } = await admin
      .from("arena_debates")
      .update({
        candidate_b_id: challengerId,
        stance_b: challenger.stance,
        status: "active",
        seat_locked_until: lock.toISOString(),
        updated_at: lock.toISOString(),
      })
      .eq("id", debate.id)
      .eq("status", "open_challenge");
    if (claimError) throw new Error(claimError.message);
    await admin.from("debate_prompts").update({ status: "locked" }).eq("id", debate.prompt_id);
    await judgeArenaExchange(debate.id);
  }

  const { data: expired, error: expiredError } = await admin
    .from("arena_debates")
    .select("id, seat_locked_until, stance_b, status")
    .eq("status", "active")
    .is("stance_b", null);
  if (expiredError) throw new Error(expiredError.message);
  const now = Date.now();
  for (const row of (expired ?? []) as { id: string; seat_locked_until: string | null }[]) {
    const lock = row.seat_locked_until ? Date.parse(row.seat_locked_until) : NaN;
    if (!Number.isFinite(lock) || lock > now) continue;
    await forfeitArenaSeat(row.id);
  }
}
