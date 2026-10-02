import { officialDonationHref } from "@/lib/escrow/candidacy";
import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  displayName,
  type PlatformAdmin,
  type PlatformProfile,
} from "@/lib/platform/records";
import { tierForStanding, type CandidateTierName } from "@/lib/platform/scoring";
import type { LeaderRow } from "@/lib/platform/types";

export type StandingRow = {
  user_id: string;
  elo: number;
  wins: number;
  losses: number;
  ties: number;
  debates_count: number;
};

export function isKycVerified(profile: PlatformProfile | null | undefined) {
  return Boolean(profile && (profile.is_verified || profile.tier2_status === "verified"));
}

/** Elo values of real debaters who have finished at least one match in this primary. */
export function activeEloField(standings: StandingRow[], profiles: Map<string, PlatformProfile>) {
  return standings
    .filter((row) => {
      const profile = profiles.get(row.user_id);
      return profile && !profile.is_synthetic && row.debates_count > 0;
    })
    .map((row) => row.elo);
}

export function tierForPrimaryStanding(
  row: StandingRow,
  profile: PlatformProfile | undefined,
  field: number[],
): CandidateTierName {
  if (!profile || profile.is_synthetic || row.debates_count <= 0) return "pundit";
  return tierForStanding(row.elo, field, isKycVerified(profile), profile.legal_name);
}

export function buildPrimaryBoard(
  standings: StandingRow[],
  profiles: Map<string, PlatformProfile>,
): { ranked: LeaderRow[]; unranked: LeaderRow[] } {
  const field = activeEloField(standings, profiles);
  const ranked: LeaderRow[] = [];
  const unranked: LeaderRow[] = [];
  const ordered = [...standings].sort((a, b) => b.elo - a.elo || a.user_id.localeCompare(b.user_id));

  for (const row of ordered) {
    const profile = profiles.get(row.user_id);
    if (!profile || profile.is_synthetic || row.debates_count <= 0) continue;
    const tier = tierForPrimaryStanding(row, profile, field);
    const verified = isKycVerified(profile);
    const entry: LeaderRow = {
      userId: row.user_id,
      legalName: profile.legal_name?.trim() || null,
      displayName: displayName(profile),
      elo: row.elo,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      tier,
      verified,
      ranked: tier === "declared_candidate" || tier === "frontrunner",
    };
    if (entry.ranked && entry.legalName) ranked.push(entry);
    else unranked.push({ ...entry, legalName: null, tier: "pundit", ranked: false });
  }

  return { ranked, unranked };
}

/** ActBlue or WinRed page for a released campaign, keyed by user. */
export async function loadReleasedDonationHrefs(admin: PlatformAdmin, userIds: string[]) {
  const hrefs = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return hrefs;
  const { data, error } = await admin
    .from("campaign_targets")
    .select("user_id, donation_url, escrow_status")
    .in("user_id", unique);
  if (error) {
    if (isMissingSchema(error)) return hrefs;
    throw new Error(error.message);
  }
  for (const row of (data ?? []) as {
    user_id: string;
    donation_url: string | null;
    escrow_status: string | null;
  }[]) {
    if (row.escrow_status !== "released" || hrefs.has(row.user_id)) continue;
    const href = officialDonationHref(row.donation_url);
    if (href) hrefs.set(row.user_id, href);
  }
  return hrefs;
}
