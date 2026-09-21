import { toNumber } from "@/lib/electability";
import type { CandidateStats, District, ElectabilityScore, UserProfile } from "@/types/database.types";

export const NATIONAL_STANDING_LIMIT = 15;

export type LeaderboardEntry = {
  id: string;
  username: string;
  wins: number;
  losses: number;
  avgConsistency: number | null;
  electability: number;
  districtId: string | null;
  districtName: string | null;
  verificationTier: string | null;
};

type StatsSlice = Pick<
  CandidateStats,
  | "id"
  | "username"
  | "debates_won"
  | "debates_played"
  | "target_district_id"
  | "verification_tier"
>;

export type ScoreSlice = Pick<
  ElectabilityScore,
  "user_id" | "district_id" | "electability_multiplier"
> & {
  users?:
    | Pick<UserProfile, "id" | "username" | "verification_tier">
    | Pick<UserProfile, "id" | "username" | "verification_tier">[]
    | null;
  districts?: Pick<District, "id" | "name"> | Pick<District, "id" | "name">[] | null;
};

export function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function formatRecord(wins: number, losses: number) {
  return `${wins}–${losses}`;
}

export function formatConsistency(value: number | null) {
  if (value == null) return "—";
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function recordFromStats(stats: Pick<CandidateStats, "debates_won" | "debates_played">) {
  const wins = Math.max(0, stats.debates_won);
  const played = Math.max(wins, stats.debates_played);
  return { wins, losses: played - wins };
}

export function sortLeaderboard(entries: LeaderboardEntry[]) {
  return [...entries].sort((left, right) => {
    if (right.electability !== left.electability) {
      return right.electability - left.electability;
    }
    if (right.wins !== left.wins) return right.wins - left.wins;
    return left.username.localeCompare(right.username);
  });
}

function districtLabel(
  stats: StatsSlice | undefined,
  score: ScoreSlice | undefined,
  districtsById: Map<string, string>,
) {
  const fromScore = unwrapRelation(score?.districts);
  if (fromScore?.name) return { id: fromScore.id, name: fromScore.name };
  const districtId = score?.district_id ?? stats?.target_district_id ?? null;
  if (!districtId) return { id: null, name: null };
  return { id: districtId, name: districtsById.get(districtId) ?? null };
}

export function mergeLeaderboardEntries({
  stats,
  scores,
  consistencies,
  districts,
  bestScoreOnly = false,
}: {
  stats: StatsSlice[];
  scores: ScoreSlice[];
  consistencies?: { author_id: string; consistency_score: number | string | null }[];
  districts?: Pick<District, "id" | "name">[];
  bestScoreOnly?: boolean;
}): LeaderboardEntry[] {
  const districtsById = new Map((districts ?? []).map((row) => [row.id, row.name]));
  const entriesById = new Map<string, LeaderboardEntry>();

  for (const row of stats) {
    const record = recordFromStats(row);
    const district = districtLabel(row, undefined, districtsById);
    entriesById.set(row.id, {
      id: row.id,
      username: row.username,
      wins: record.wins,
      losses: record.losses,
      avgConsistency: null,
      electability: 0,
      districtId: district.id,
      districtName: district.name,
      verificationTier: row.verification_tier ?? null,
    });
  }

  for (const row of scores) {
    const user = unwrapRelation(row.users);
    const id = user?.id ?? row.user_id;
    if (!id) continue;

    const current = entriesById.get(id);
    const electability = toNumber(row.electability_multiplier);
    if (bestScoreOnly && current && electability < current.electability) continue;

    const district = districtLabel(
      current
        ? {
            id: current.id,
            username: current.username,
            debates_won: current.wins,
            debates_played: current.wins + current.losses,
            target_district_id: current.districtId,
            verification_tier: current.verificationTier ?? "unverified",
          }
        : undefined,
      row,
      districtsById,
    );

    entriesById.set(id, {
      id,
      username: user?.username ?? current?.username ?? "Unnamed candidate",
      wins: current?.wins ?? 0,
      losses: current?.losses ?? 0,
      avgConsistency: current?.avgConsistency ?? null,
      electability,
      districtId: district.id,
      districtName: district.name,
      verificationTier: user?.verification_tier ?? current?.verificationTier ?? null,
    });
  }

  if (consistencies && consistencies.length > 0) {
    const totals = new Map<string, { sum: number; count: number }>();
    for (const row of consistencies) {
      if (!row.author_id) continue;
      const score = toNumber(row.consistency_score);
      const current = totals.get(row.author_id) ?? { sum: 0, count: 0 };
      current.sum += score;
      current.count += 1;
      totals.set(row.author_id, current);
    }

    for (const [id, total] of totals) {
      const entry = entriesById.get(id);
      if (!entry || total.count === 0) continue;
      entry.avgConsistency = total.sum / total.count;
    }
  }

  return sortLeaderboard([...entriesById.values()]);
}
