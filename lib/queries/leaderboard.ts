import { cache } from "react";
import { isUuid } from "@/lib/arena/display";
import { parseElo } from "@/lib/arena/elo";
import { formatCandidacyLabel } from "@/lib/campaign/targets";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { recordFromStats } from "@/lib/leaderboard";
import { parseAmount } from "@/lib/pledges";

export const GLOBAL_LEADERBOARD_LIMIT = 50;
export const ALIGNMENT_STREAK_GOAL = 10;

export type GlobalRanking = {
  id: string;
  rank: number;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  isViewer: boolean;
};

type StatsRow = {
  id: string;
  username: string | null;
  elo_rating: number | string | null;
  debates_won: number | null;
  debates_played: number | null;
};

function asOcdIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

/**
 * Top candidates by Elo, with their win/loss record.
 *
 * `candidate_stats` is a view over `public.users` (there is no `profiles`
 * table), so it already carries `username`, `elo_rating`, and the record
 * computed from completed debates. Losses are played debates that were not
 * wins, so `debates_played > 0` is the same as wins + losses > 0.
 */
export async function loadGlobalLeaderboard(
  viewerId: string | null,
  limit = GLOBAL_LEADERBOARD_LIMIT,
): Promise<{ rankings: GlobalRanking[]; error: string | null }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("candidate_stats")
    .select("id, username, elo_rating, debates_won, debates_played")
    .gt("debates_played", 0)
    .order("elo_rating", { ascending: false })
    .order("debates_won", { ascending: false })
    .order("username", { ascending: true })
    .limit(limit);

  if (error) return { rankings: [], error: error.message };

  const rankings = ((data ?? []) as StatsRow[]).map((row, index) => {
    const record = recordFromStats({
      debates_won: row.debates_won ?? 0,
      debates_played: row.debates_played ?? 0,
    });
    return {
      id: row.id,
      rank: index + 1,
      username: row.username?.trim() || "Unnamed candidate",
      elo: parseElo(row.elo_rating),
      wins: record.wins,
      losses: record.losses,
      isViewer: row.id === viewerId,
    };
  });

  return { rankings, error: null };
}

export type DistrictLeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  elo: number;
  alignmentStreak: number;
  escrowTotal: number;
  endorsements: number;
};

export type DistrictLeaderboardRace = {
  id: string;
  officeName: string;
  label: string;
  ocdId: string | null;
  electionDate: string | null;
};

export type DistrictLeaderboard = {
  election: DistrictLeaderboardRace | null;
  rankings: DistrictLeaderboardEntry[];
  error: string | null;
};

export type ActiveLeaderboardRace = DistrictLeaderboardRace & {
  candidateCount: number;
};

function toRaceLabel(row: {
  office_name: string;
  ocd_id?: string | null;
  election_date?: string | null;
}) {
  return formatCandidacyLabel(row.office_name, row.ocd_id, row.election_date);
}

/**
 * Rank every candidate targeting `electionId` by Elo, with streak, escrow, and
 * endorsement counts. `campaign_targets` and `campaign_pledges` are private
 * under RLS, so this reads with the service-role client and returns public fields only.
 */
export const getDistrictLeaderboard = cache(async function getDistrictLeaderboard(
  electionId: string,
): Promise<DistrictLeaderboard> {
  const empty: DistrictLeaderboard = { election: null, rankings: [], error: null };
  if (!isUuid(electionId)) return empty;

  try {
    const admin = createAdminClient();

    const { data: election, error: electionError } = await admin
      .from("elections")
      .select("id, office_name, ocd_id, election_date")
      .eq("id", electionId)
      .maybeSingle();
    if (electionError) return { ...empty, error: electionError.message };
    if (!election) return empty;

    const race: DistrictLeaderboardRace = {
      id: election.id,
      officeName: election.office_name,
      ocdId: election.ocd_id ?? null,
      electionDate: election.election_date ?? null,
      label: toRaceLabel(election),
    };

    const { data: targets, error: targetError } = await admin
      .from("campaign_targets")
      .select("user_id, alignment_streak")
      .eq("election_id", electionId);
    if (targetError) return { election: race, rankings: [], error: targetError.message };

    const streaks = new Map<string, number>();
    for (const row of targets ?? []) {
      streaks.set(row.user_id, Math.max(row.alignment_streak ?? 0, streaks.get(row.user_id) ?? 0));
    }
    const candidateIds = [...streaks.keys()];
    if (candidateIds.length === 0) return { election: race, rankings: [], error: null };

    const [usersQuery, profilesQuery, pledgesQuery, endorsementsQuery] = await Promise.all([
      admin.from("users").select("id, username, elo_rating").in("id", candidateIds),
      admin.from("profiles").select("id, full_name").in("id", candidateIds),
      admin
        .from("campaign_pledges")
        .select("candidate_id, amount, status")
        .eq("election_id", electionId)
        .in("candidate_id", candidateIds)
        .in("status", ["pending", "released"]),
      admin.from("coalition_endorsements").select("endorsed_id").in("endorsed_id", candidateIds),
    ]);

    if (usersQuery.error) return { election: race, rankings: [], error: usersQuery.error.message };
    if (profilesQuery.error && !isMissingRelation(profilesQuery.error)) {
      return { election: race, rankings: [], error: profilesQuery.error.message };
    }
    if (pledgesQuery.error && !isMissingRelation(pledgesQuery.error)) {
      return { election: race, rankings: [], error: pledgesQuery.error.message };
    }
    if (endorsementsQuery.error && !isMissingRelation(endorsementsQuery.error)) {
      return { election: race, rankings: [], error: endorsementsQuery.error.message };
    }

    const names = new Map<string, string>();
    const elos = new Map<string, number>();
    for (const row of (usersQuery.data ?? []) as {
      id: string;
      username: string | null;
      elo_rating: number | string | null;
    }[]) {
      names.set(row.id, row.username?.trim() || "Unnamed candidate");
      elos.set(row.id, parseElo(row.elo_rating));
    }
    for (const row of (profilesQuery.error ? [] : (profilesQuery.data ?? [])) as {
      id: string;
      full_name: string | null;
    }[]) {
      const fullName = row.full_name?.trim();
      if (fullName) names.set(row.id, fullName);
    }

    const escrow = new Map<string, number>();
    for (const row of (pledgesQuery.error ? [] : (pledgesQuery.data ?? [])) as {
      candidate_id: string;
      amount: number | string | null;
      status: string;
    }[]) {
      escrow.set(row.candidate_id, (escrow.get(row.candidate_id) ?? 0) + parseAmount(row.amount));
    }

    const endorsements = new Map<string, number>();
    for (const row of (endorsementsQuery.error ? [] : (endorsementsQuery.data ?? [])) as {
      endorsed_id: string;
    }[]) {
      endorsements.set(row.endorsed_id, (endorsements.get(row.endorsed_id) ?? 0) + 1);
    }

    const rankings = candidateIds
      .map((id) => ({
        id,
        rank: 0,
        name: names.get(id) ?? "Unnamed candidate",
        elo: elos.get(id) ?? parseElo(null),
        alignmentStreak: streaks.get(id) ?? 0,
        escrowTotal: escrow.get(id) ?? 0,
        endorsements: endorsements.get(id) ?? 0,
      }))
      .sort(
        (left, right) =>
          right.elo - left.elo ||
          right.escrowTotal - left.escrowTotal ||
          left.name.localeCompare(right.name),
      )
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return { election: race, rankings, error: null };
  } catch (caught) {
    return {
      election: null,
      rankings: [],
      error: caught instanceof Error ? caught.message : "Could not load this district leaderboard.",
    };
  }
});

/** Elections that already have at least one declared candidate. */
export async function listActiveLeaderboardRaces(): Promise<ActiveLeaderboardRace[]> {
  try {
    const admin = createAdminClient();
    const { data: targets, error: targetError } = await admin
      .from("campaign_targets")
      .select("election_id");
    if (targetError) throw new Error(targetError.message);

    const counts = new Map<string, number>();
    for (const row of targets ?? []) {
      counts.set(row.election_id, (counts.get(row.election_id) ?? 0) + 1);
    }
    const electionIds = [...counts.keys()];
    if (electionIds.length === 0) return [];

    const { data: elections, error: electionError } = await admin
      .from("elections")
      .select("id, office_name, ocd_id, election_date")
      .in("id", electionIds);
    if (electionError) throw new Error(electionError.message);

    return ((elections ?? []) as {
      id: string;
      office_name: string;
      ocd_id?: string | null;
      election_date?: string | null;
    }[])
      .map((row) => ({
        id: row.id,
        officeName: row.office_name,
        ocdId: row.ocd_id ?? null,
        electionDate: row.election_date ?? null,
        label: toRaceLabel(row),
        candidateCount: counts.get(row.id) ?? 0,
      }))
      .sort(
        (left, right) =>
          right.candidateCount - left.candidateCount || left.label.localeCompare(right.label),
      );
  } catch (caught) {
    console.error("listActiveLeaderboardRaces failed.", caught);
    return [];
  }
}

/** Primary upcoming race on the viewer's home ballot, if one exists. */
export async function resolveHomeLeaderboardElection(
  userId: string | null,
): Promise<ActiveLeaderboardRace | null> {
  if (!userId) return null;

  try {
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("home_ocd_ids")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const homes = asOcdIds(profile?.home_ocd_ids).map((id) => normalizeOcdId(id)).filter(Boolean);
    if (homes.length === 0) return null;

    const { data: elections, error: electionError } = await admin
      .from("elections")
      .select("id, office_name, ocd_id, election_date");
    if (electionError) throw new Error(electionError.message);

    const matches = ((elections ?? []) as {
      id: string;
      office_name: string;
      ocd_id?: string | null;
      election_date?: string | null;
    }[]).filter((row) => homes.includes(normalizeOcdId(row.ocd_id)));
    if (matches.length === 0) return null;

    const { data: targets } = await admin
      .from("campaign_targets")
      .select("election_id")
      .in(
        "election_id",
        matches.map((row) => row.id),
      );
    const counts = new Map<string, number>();
    for (const row of targets ?? []) {
      counts.set(row.election_id, (counts.get(row.election_id) ?? 0) + 1);
    }

    const ranked = matches
      .map((row) => ({
        id: row.id,
        officeName: row.office_name,
        ocdId: row.ocd_id ?? null,
        electionDate: row.election_date ?? null,
        label: toRaceLabel(row),
        candidateCount: counts.get(row.id) ?? 0,
      }))
      .sort((left, right) => {
        const leftHome = homes.indexOf(normalizeOcdId(left.ocdId));
        const rightHome = homes.indexOf(normalizeOcdId(right.ocdId));
        if (leftHome !== rightHome) return leftHome - rightHome;
        return right.candidateCount - left.candidateCount;
      });

    return ranked[0] ?? null;
  } catch (caught) {
    console.error("resolveHomeLeaderboardElection failed.", caught);
    return null;
  }
}
