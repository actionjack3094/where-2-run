import { parseElo } from "@/lib/arena/elo";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { recordFromStats } from "@/lib/leaderboard";

export const GLOBAL_LEADERBOARD_LIMIT = 50;

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

export const DISTRICT_LEADERBOARD_LIMIT = 10;

export type DistrictRanking = GlobalRanking & {
  alignmentStreak: number;
};

/**
 * Top `limit` candidates by Elo who are actively targeting a district, matched by OCD
 * division. A race counts when `elections.ocd_id` is the division or when its
 * district row carries that `ocd_id`. Candidates with no completed debates are
 * kept (they are still rivals for the seat) and rank by Elo like everyone else.
 *
 * If the viewer targets the district but ranks below `limit`, their row (with
 * their true rank) is appended as an extra final item.
 *
 * `campaign_targets` is private to each user under RLS, so this reads with the
 * service-role client. Only public fields are returned.
 */
export async function getDistrictLeaderboard(
  ocdId: string,
  viewerId: string | null = null,
  limit = DISTRICT_LEADERBOARD_LIMIT,
): Promise<{ rankings: DistrictRanking[]; error: string | null }> {
  try {
    const admin = createAdminClient();
    const wanted = normalizeOcdId(ocdId);

    const [electionsQuery, districtsQuery] = await Promise.all([
      admin.from("elections").select("id, ocd_id, district_id"),
      admin.from("districts").select("id, ocd_id"),
    ]);
    if (electionsQuery.error) return { rankings: [], error: electionsQuery.error.message };
    if (districtsQuery.error) return { rankings: [], error: districtsQuery.error.message };

    const districtIds = new Set(
      (districtsQuery.data ?? [])
        .filter((row) => normalizeOcdId(row.ocd_id) === wanted)
        .map((row) => row.id),
    );
    const electionIds = (electionsQuery.data ?? [])
      .filter(
        (row) =>
          normalizeOcdId(row.ocd_id) === wanted ||
          (row.district_id !== null && districtIds.has(row.district_id)),
      )
      .map((row) => row.id);
    if (electionIds.length === 0) return { rankings: [], error: null };

    const targetsQuery = await admin
      .from("campaign_targets")
      .select("user_id, alignment_streak")
      .in("election_id", electionIds);
    if (targetsQuery.error) return { rankings: [], error: targetsQuery.error.message };

    const streaks = new Map<string, number>();
    for (const row of targetsQuery.data ?? []) {
      const streak = row.alignment_streak ?? 0;
      streaks.set(row.user_id, Math.max(streak, streaks.get(row.user_id) ?? 0));
    }
    if (streaks.size === 0) return { rankings: [], error: null };

    const statsQuery = await admin
      .from("candidate_stats")
      .select("id, username, elo_rating, debates_won, debates_played")
      .in("id", [...streaks.keys()])
      .order("elo_rating", { ascending: false })
      .order("debates_won", { ascending: false })
      .order("username", { ascending: true })
      .limit(limit);
    if (statsQuery.error) return { rankings: [], error: statsQuery.error.message };

    const toRanking = (row: StatsRow, rank: number): DistrictRanking => {
      const record = recordFromStats({
        debates_won: row.debates_won ?? 0,
        debates_played: row.debates_played ?? 0,
      });
      return {
        id: row.id,
        rank,
        username: row.username?.trim() || "Unnamed candidate",
        elo: parseElo(row.elo_rating),
        wins: record.wins,
        losses: record.losses,
        isViewer: row.id === viewerId,
        alignmentStreak: streaks.get(row.id) ?? 0,
      };
    };

    const topRows = (statsQuery.data ?? []) as StatsRow[];
    const rankings = topRows.map((row, index) => toRanking(row, index + 1));

    // Pin the viewer below the top N when they target this district but fell
    // outside the cutoff, so they never vanish from the board.
    if (viewerId && streaks.has(viewerId) && !topRows.some((row) => row.id === viewerId)) {
      const viewerQuery = await admin
        .from("candidate_stats")
        .select("id, username, elo_rating, debates_won, debates_played")
        .eq("id", viewerId)
        .maybeSingle();
      if (viewerQuery.error) return { rankings, error: viewerQuery.error.message };

      const viewerRow = viewerQuery.data as StatsRow | null;
      if (viewerRow) {
        // Only candidates with Elo at or above the viewer's can outrank them.
        const viewerElo = Number(viewerRow.elo_rating);
        const aheadQuery = await admin
          .from("candidate_stats")
          .select("id, username, elo_rating, debates_won")
          .in("id", [...streaks.keys()])
          .neq("id", viewerId)
          .gte("elo_rating", viewerRow.elo_rating ?? 0);
        if (aheadQuery.error) return { rankings, error: aheadQuery.error.message };

        const viewerWins = viewerRow.debates_won ?? 0;
        const viewerName = viewerRow.username?.trim() || "Unnamed candidate";
        // Mirrors the ordering above: Elo desc, wins desc, username asc.
        const ahead = (aheadQuery.data ?? []).filter((row) => {
          const elo = Number(row.elo_rating);
          if (elo !== viewerElo) return elo > viewerElo;
          const wins = row.debates_won ?? 0;
          if (wins !== viewerWins) return wins > viewerWins;
          return (row.username?.trim() || "Unnamed candidate").localeCompare(viewerName) < 0;
        }).length;

        // The viewer sits outside the top `limit`, so never rank them inside it.
        rankings.push(toRanking(viewerRow, Math.max(ahead + 1, topRows.length + 1)));
      }
    }

    return { rankings, error: null };
  } catch (caught) {
    return {
      rankings: [],
      error: caught instanceof Error ? caught.message : "Could not load district rivals.",
    };
  }
}
