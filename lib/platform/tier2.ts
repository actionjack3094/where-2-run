import { isMissingSchema } from "@/lib/db/schema-errors";
import { loadProfile, type PlatformAdmin } from "@/lib/platform/records";

export const TIER2_ERROR =
  "Tier 2 verification is required. Finish Stripe Identity and match a voter file before filing an issue or a question.";

export function tier2Allows(input: {
  isVerified: boolean;
  tier2Status: string | null;
  homeOcdIds: string[];
}) {
  const identity = input.isVerified || input.tier2Status === "verified";
  return identity && input.homeOcdIds.length > 0;
}

/** Voters ask. Candidates reply. A voter never answers another voter. */
export function hubSpokeAllows(role: "voter" | "candidate", action: "ask" | "reply") {
  if (action === "ask") return role === "voter";
  return role === "candidate";
}

export async function constituentAccess(admin: PlatformAdmin, userId: string) {
  const loaded = await admin
    .from("profiles")
    .select("is_verified, tier2_status, home_ocd_ids")
    .eq("id", userId)
    .maybeSingle();

  if (loaded.error && isMissingSchema(loaded.error)) {
    const profile = await loadProfile(admin, userId);
    const identity = Boolean(profile?.is_verified || profile?.tier2_status === "verified");
    return identity ? { ok: true as const } : { ok: false as const, error: TIER2_ERROR };
  }
  if (loaded.error) return { ok: false as const, error: loaded.error.message };

  const row = loaded.data as {
    is_verified?: boolean | null;
    tier2_status?: string | null;
    home_ocd_ids?: string[] | null;
  } | null;
  const home = Array.isArray(row?.home_ocd_ids) ? row.home_ocd_ids.filter(Boolean) : [];
  if (
    tier2Allows({
      isVerified: row?.is_verified === true,
      tier2Status: row?.tier2_status ?? null,
      homeOcdIds: home,
    })
  ) {
    return { ok: true as const };
  }
  return { ok: false as const, error: TIER2_ERROR };
}
