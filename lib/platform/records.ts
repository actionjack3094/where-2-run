import { createAdminClient } from "@/lib/db/supabase-admin";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { normalizeOcdId } from "@/lib/civic-fencing";
import {
  higherTier,
  parseTier,
  tierForStanding,
  type CandidateTierName,
} from "@/lib/platform/scoring";
import type { ArenaDebate, DebatePrompt, Primary, PrimaryStanding } from "@/types/database.types";

export type PlatformAdmin = ReturnType<typeof createAdminClient>;

/** Public columns only. Internal scores are omitted on purpose. */
export const ARENA_PUBLIC_COLUMNS =
  "id, primary_id, prompt_id, candidate_a_id, candidate_b_id, stance_a, stance_b, seat_locked_until, status, winner_id, is_tie, created_at, updated_at";

export type ArenaPublic = Omit<ArenaDebate, "candidate_a_score" | "candidate_b_score">;

export type PlatformProfile = {
  id: string;
  ideology_x: number | null;
  ideology_y: number | null;
  onboarding_completed: boolean;
  is_verified: boolean;
  tier2_status: string | null;
  legal_name: string | null;
  display_name: string | null;
  full_name: string | null;
  candidate_tier: string;
  is_synthetic: boolean;
  synthetic_key: string | null;
};

const PROFILE_COLUMNS =
  "id, ideology_x, ideology_y, onboarding_completed, is_verified, tier2_status, legal_name, display_name, full_name, candidate_tier, is_synthetic, synthetic_key";

export function canRank(profile: PlatformProfile) {
  const verified = profile.is_verified || profile.tier2_status === "verified";
  return verified && !profile.is_synthetic && Boolean(profile.legal_name?.trim());
}

export function platformAdmin() {
  return createAdminClient();
}

export function schemaMessage(error: { message?: string; code?: string } | null) {
  if (!isMissingSchema(error)) return null;
  return "Apply the platform architecture migration, then reload.";
}

export function displayName(profile: Pick<PlatformProfile, "display_name" | "full_name"> | null) {
  return profile?.display_name?.trim() || profile?.full_name?.trim() || "Contender";
}

export async function loadProfile(admin: PlatformAdmin, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  return (data as PlatformProfile | null) ?? null;
}

export async function loadProfiles(admin: PlatformAdmin, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, PlatformProfile>();
  const { data, error } = await admin.from("profiles").select(PROFILE_COLUMNS).in("id", unique);
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  return new Map(((data ?? []) as PlatformProfile[]).map((row) => [row.id, row]));
}

function normalizeOcdList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => normalizeOcdId(String(id))).filter(Boolean))];
}

/** Voter divisions from profiles.ocd_ids. Older home_ocd_ids rows fill in until an address is confirmed. */
export async function loadHomeOcdIds(admin: PlatformAdmin, userId: string) {
  const profile = await admin.from("profiles").select("ocd_ids").eq("id", userId).maybeSingle();
  if (!profile.error) {
    const ids = normalizeOcdList((profile.data as { ocd_ids?: string[] | null } | null)?.ocd_ids);
    if (ids.length > 0) return ids;
  } else if (!isMissingSchema(profile.error)) {
    throw new Error(profile.error.message);
  }

  const { data, error } = await admin
    .from("users")
    .select("home_ocd_ids")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }
  return normalizeOcdList((data as { home_ocd_ids?: string[] | null } | null)?.home_ocd_ids);
}

export function ocdMatches(homeOcdIds: string[], ocdId: string) {
  const target = normalizeOcdId(ocdId);
  return Boolean(target) && homeOcdIds.includes(target);
}

export async function loadPrimaries(admin: PlatformAdmin) {
  const { data, error } = await admin
    .from("primaries")
    .select("id, party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug, created_at")
    .order("state", { ascending: true });
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  return (data ?? []) as Primary[];
}

export async function loadPrimaryBySlug(admin: PlatformAdmin, slug: string) {
  const { data, error } = await admin
    .from("primaries")
    .select("id, party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  return (data as Primary | null) ?? null;
}

export async function loadArenaById(admin: PlatformAdmin, debateId: string) {
  const { data, error } = await admin
    .from("arena_debates")
    .select(ARENA_PUBLIC_COLUMNS)
    .eq("id", debateId)
    .maybeSingle();
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  return (data as ArenaPublic | null) ?? null;
}

export async function loadPrompt(admin: PlatformAdmin, promptId: string) {
  const { data, error } = await admin
    .from("debate_prompts")
    .select("id, primary_id, author_id, author_kind, prompt_text, stance_text, ideology_x, ideology_y, status, created_at")
    .eq("id", promptId)
    .maybeSingle();
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  return (data as DebatePrompt | null) ?? null;
}

export async function loadStanding(admin: PlatformAdmin, userId: string, primaryId: string) {
  const { data, error } = await admin
    .from("primary_standings")
    .select("id, user_id, primary_id, elo, debates_count, wins, losses, ties, created_at, updated_at")
    .eq("user_id", userId)
    .eq("primary_id", primaryId)
    .maybeSingle();
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  return (data as PrimaryStanding | null) ?? null;
}

export async function rankedField(admin: PlatformAdmin, primaryId: string) {
  const { data, error } = await admin
    .from("primary_standings")
    .select("user_id, elo, debates_count")
    .eq("primary_id", primaryId);
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  const rows = (data ?? []) as { user_id: string; elo: number; debates_count: number }[];
  const profiles = await loadProfiles(
    admin,
    rows.map((row) => row.user_id),
  );
  return rows
    .filter((row) => {
      const profile = profiles.get(row.user_id);
      return profile && !profile.is_synthetic && row.debates_count > 0;
    })
    .map((row) => row.elo);
}

export async function recomputeTier(admin: PlatformAdmin, userId: string) {
  const profile = await loadProfile(admin, userId);
  if (!profile) return "pundit" as CandidateTierName;
  const { data, error } = await admin
    .from("primary_standings")
    .select("primary_id, elo, debates_count")
    .eq("user_id", userId);
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  const rows = (data ?? []) as { primary_id: string; elo: number; debates_count: number }[];
  let best: CandidateTierName = "pundit";
  for (const row of rows) {
    const field = await rankedField(admin, row.primary_id);
    const next = tierForStanding(
      row.elo,
      field,
      canRank(profile) && row.debates_count > 0,
      profile.legal_name,
    );
    best = higherTier(best, next);
  }
  const { error: updateError } = await admin
    .from("profiles")
    .update({ candidate_tier: best, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (updateError) throw new Error(updateError.message);
  return best;
}

export function asTier(value: string | null | undefined) {
  return parseTier(value);
}
