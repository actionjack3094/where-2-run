import { createAdminClient } from "@/lib/db/supabase-admin";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { preferCurrentPrimary } from "@/lib/platform/cycle";
import { asElectionLevel } from "@/lib/platform/states";
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
  is_banned: boolean;
  is_admin: boolean;
  avatar_url: string | null;
};

const PROFILE_BASE =
  "id, ideology_x, ideology_y, onboarding_completed, is_verified, tier2_status, legal_name, display_name, full_name, candidate_tier, is_synthetic, synthetic_key";
const PROFILE_COLUMNS = `${PROFILE_BASE}, is_banned, is_admin, avatar_url`;

function withModeration(
  row: Omit<PlatformProfile, "is_banned" | "is_admin" | "avatar_url"> & {
    is_banned?: boolean;
    is_admin?: boolean;
    avatar_url?: string | null;
  },
): PlatformProfile {
  return {
    ...row,
    is_banned: row.is_banned === true,
    is_admin: row.is_admin === true,
    avatar_url: row.avatar_url?.trim() || null,
  };
}

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
  const full = await admin.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (!full.error) return full.data ? withModeration(full.data) : null;
  if (!isMissingSchema(full.error)) throw new Error(schemaMessage(full.error) ?? full.error.message);
  const base = await admin.from("profiles").select(PROFILE_BASE).eq("id", userId).maybeSingle();
  if (base.error) throw new Error(schemaMessage(base.error) ?? base.error.message);
  return base.data ? withModeration(base.data) : null;
}

export async function loadProfiles(admin: PlatformAdmin, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, PlatformProfile>();
  const full = await admin.from("profiles").select(PROFILE_COLUMNS).in("id", unique);
  if (!full.error) {
    return new Map((full.data ?? []).map((row) => [row.id, withModeration(row)]));
  }
  if (!isMissingSchema(full.error)) throw new Error(schemaMessage(full.error) ?? full.error.message);
  const base = await admin.from("profiles").select(PROFILE_BASE).in("id", unique);
  if (base.error) throw new Error(schemaMessage(base.error) ?? base.error.message);
  return new Map((base.data ?? []).map((row) => [row.id, withModeration(row)]));
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

const PRIMARY_BASE =
  "id, party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug, created_at";
const PRIMARY_COLUMNS =
  `${PRIMARY_BASE}, cycle_year, primary_date, general_election_date, term_length_years, senate_class, status, level`;

function normalizePrimary(row: Primary): Primary {
  return {
    ...row,
    level: asElectionLevel(row.level, row.office_name),
    cycle_year: row.cycle_year ?? 0,
    primary_date: row.primary_date ?? "",
    general_election_date: row.general_election_date ?? null,
    term_length_years: row.term_length_years ?? 2,
    senate_class: row.senate_class ?? null,
    status: row.status === "frozen" ? "frozen" : "active",
  };
}

export async function loadPrimaries(admin: PlatformAdmin) {
  const full = await admin.from("primaries").select(PRIMARY_COLUMNS).order("state", { ascending: true });
  if (!full.error) return ((full.data ?? []) as Primary[]).map(normalizePrimary);
  if (!isMissingSchema(full.error)) {
    throw new Error(schemaMessage(full.error) ?? full.error.message);
  }
  const base = await admin.from("primaries").select(PRIMARY_BASE).order("state", { ascending: true });
  if (base.error) throw new Error(schemaMessage(base.error) ?? base.error.message);
  return ((base.data ?? []) as Primary[]).map(normalizePrimary);
}

export async function loadPrimaryBySlug(admin: PlatformAdmin, slug: string) {
  const full = await admin.from("primaries").select(PRIMARY_COLUMNS).eq("slug", slug);
  if (!full.error) {
    return preferCurrentPrimary(((full.data ?? []) as Primary[]).map(normalizePrimary), slug);
  }
  if (!isMissingSchema(full.error)) {
    throw new Error(schemaMessage(full.error) ?? full.error.message);
  }
  const base = await admin.from("primaries").select(PRIMARY_BASE).eq("slug", slug);
  if (base.error) throw new Error(schemaMessage(base.error) ?? base.error.message);
  return preferCurrentPrimary(((base.data ?? []) as Primary[]).map(normalizePrimary), slug);
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
    .select(
      "id, user_id, primary_id, civic_standing, debates_count, debates_logged, policy_consistency, ties, created_at, updated_at",
    )
    .eq("user_id", userId)
    .eq("primary_id", primaryId)
    .maybeSingle();
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  return (data as PrimaryStanding | null) ?? null;
}

export async function rankedField(admin: PlatformAdmin, primaryId: string) {
  const { data, error } = await admin
    .from("primary_standings")
    .select("user_id, civic_standing, debates_count")
    .eq("primary_id", primaryId);
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  const rows = (data ?? []) as { user_id: string; civic_standing: number; debates_count: number }[];
  const profiles = await loadProfiles(
    admin,
    rows.map((row) => row.user_id),
  );
  return rows
    .filter((row) => {
      const profile = profiles.get(row.user_id);
      return profile && !profile.is_synthetic && row.debates_count > 0;
    })
    .map((row) => row.civic_standing);
}

export async function recomputeTier(admin: PlatformAdmin, userId: string) {
  const profile = await loadProfile(admin, userId);
  if (!profile) return "pundit" as CandidateTierName;
  const { data, error } = await admin
    .from("primary_standings")
    .select("primary_id, civic_standing, debates_count")
    .eq("user_id", userId);
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  const rows = (data ?? []) as { primary_id: string; civic_standing: number; debates_count: number }[];
  let best: CandidateTierName = "pundit";
  for (const row of rows) {
    const field = await rankedField(admin, row.primary_id);
    const next = tierForStanding(
      row.civic_standing,
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
