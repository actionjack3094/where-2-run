import { cache } from "react";
import { parseElo } from "@/lib/arena/elo";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createServerSupabase, getServerUser } from "@/lib/db/supabase-server";
import {
  projectContestOutlook,
  toNumber,
  unwrapDistrict,
} from "@/lib/electability";
import {
  resolveElectionLink,
  type ElectionLinkRow,
} from "@/lib/election-links";
import { sixAxisMatchPercent, toSixAxisVector } from "@/lib/ideology/six-axis";
import {
  TOP_MATCHED_ELECTIONS,
  type ContestProfile,
  type ContestRow,
} from "@/lib/leaderboards/contests";
import { recordFromStats } from "@/lib/leaderboard";
import { calculateDraftViabilityScore } from "@/lib/math/viability";
import { parseAmount } from "@/lib/pledges";
import type {
  CampaignPledge,
  CandidateStats,
  District,
  ElectabilityScore,
  Election,
  UserProfile,
} from "@/types/database.types";

export type LeaderboardDashboard = {
  signedIn: boolean;
  profile: ContestProfile | null;
  contests: ContestRow[];
  error: string | null;
};

type ScoreRow = ElectabilityScore & {
  districts: District | District[] | null;
};

type ElectionCatalogRow = Pick<
  Election,
  | "id"
  | "slug"
  | "office_name"
  | "incumbent_name"
  | "district_id"
  | "median_voter_vector"
>;

function emptyDashboard(
  partial: Partial<LeaderboardDashboard> = {},
): LeaderboardDashboard {
  return {
    signedIn: false,
    profile: null,
    contests: [],
    error: null,
    ...partial,
  };
}

type QueryClient = Awaited<ReturnType<typeof createServerSupabase>>;

function tryAdminClient() {
  try {
    return createAdminClient();
  } catch (caught) {
    if (
      caught instanceof Error &&
      /SUPABASE_SERVICE_ROLE_KEY/i.test(caught.message)
    ) {
      return null;
    }
    throw caught;
  }
}

function isJwtClockError(error: { message?: string } | null) {
  return /jwt issued at future|invalid jwt/i.test(error?.message ?? "");
}

function queryErrorMessage(error: { message?: string } | null) {
  if (!error?.message || isJwtClockError(error) || isMissingRelation(error)) {
    return null;
  }
  return error.message;
}

async function loadUncapturedBounties(electionIds: string[]) {
  const totals = new Map<string, number>();
  if (electionIds.length === 0) return totals;

  const admin = tryAdminClient();
  if (!admin) return totals;

  const { data, error } = await admin
    .from("campaign_pledges")
    .select("election_id, amount, status")
    .in("election_id", electionIds)
    .eq("status", "pending");

  if (error) {
    if (isMissingRelation(error) || isJwtClockError(error)) return totals;
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as Pick<
    CampaignPledge,
    "election_id" | "amount" | "status"
  >[]) {
    totals.set(
      row.election_id,
      (totals.get(row.election_id) ?? 0) + parseAmount(row.amount),
    );
  }

  return totals;
}

function buildContest(input: {
  election: ElectionCatalogRow;
  district: District | null;
  wins: number;
  losses: number;
  eloRating: number;
  primaryMatch: number;
  ideologyVector: unknown;
  uncapturedBounty: number;
}): ContestRow {
  const outlook = projectContestOutlook({
    pviScore: input.district?.pvi_score,
    matchPercent: input.primaryMatch,
    ideologyVector: input.ideologyVector,
  });
  const draftViability = calculateDraftViabilityScore({
    primaryMatch: input.primaryMatch,
    generalViability: outlook.generalPct,
    eloRating: input.eloRating,
  });

  return {
    electionId: input.election.id,
    slug: input.election.slug,
    officeName: input.election.office_name,
    incumbentName: input.election.incumbent_name,
    districtId: input.district?.id ?? input.election.district_id,
    districtName: input.district?.name ?? null,
    historicalLean: input.district?.historical_lean ?? null,
    wins: input.wins,
    losses: input.losses,
    eloRating: input.eloRating,
    primaryMatch: Math.round(toNumber(input.primaryMatch)),
    generalViability: outlook.generalPct,
    draftViability,
    uncapturedBounty: input.uncapturedBounty,
  };
}

export const loadLeaderboardDashboard = cache(
  async (): Promise<LeaderboardDashboard> => {
    const supabase = await createServerSupabase();
    const user = await getServerUser();
    if (!user) return emptyDashboard();

    const db: QueryClient = tryAdminClient() ?? supabase;
    const [profileQuery, statsQuery, scoresQuery, electionsQuery, districtsQuery] =
      await Promise.all([
        db.from("users").select("*").eq("id", user.id).maybeSingle(),
        db.from("candidate_stats").select("*").eq("id", user.id).maybeSingle(),
        db
          .from("electability_scores")
          .select("*, districts(*)")
          .eq("user_id", user.id),
        db
          .from("elections")
          .select(
            "id, slug, office_name, incumbent_name, district_id, median_voter_vector",
          )
          .order("office_name"),
        db.from("districts").select("*"),
      ]);

    const fatal =
      queryErrorMessage(profileQuery.error) ??
      queryErrorMessage(statsQuery.error) ??
      queryErrorMessage(scoresQuery.error) ??
      (isMissingRelation(electionsQuery.error)
        ? "The elections table is not available yet."
        : queryErrorMessage(electionsQuery.error)) ??
      queryErrorMessage(districtsQuery.error);
    if (fatal) {
      return emptyDashboard({ signedIn: true, error: fatal });
    }

    const profile = (profileQuery.data as UserProfile | null) ?? null;
    const stats = (statsQuery.data as CandidateStats | null) ?? null;
    const record = stats
      ? recordFromStats(stats)
      : { wins: 0, losses: 0 };
    const eloRating = parseElo(stats?.elo_rating ?? profile?.elo_rating);
    const ideologyVector = profile?.ideology_vector ?? stats?.ideology_vector;
    const elections = (electionsQuery.data ?? []) as ElectionCatalogRow[];
    const districtsById = new Map(
      ((districtsQuery.data ?? []) as District[]).map((row) => [row.id, row]),
    );
    const electionLinks: ElectionLinkRow[] = elections.map((row) => ({
      id: row.id,
      slug: row.slug,
      office_name: row.office_name,
      district_id: row.district_id,
    }));

    const dashboardProfile: ContestProfile = {
      id: profile?.id ?? user.id,
      username: profile?.username ?? stats?.username ?? "Unnamed candidate",
      wins: record.wins,
      losses: record.losses,
      eloRating,
    };

    let bounties: Map<string, number>;
    try {
      bounties = await loadUncapturedBounties(elections.map((row) => row.id));
    } catch (caught) {
      return emptyDashboard({
        signedIn: true,
        profile: dashboardProfile,
        error:
          caught instanceof Error
            ? caught.message
            : "Could not load uncaptured draft bounties.",
      });
    }

    const contestsByElection = new Map<string, ContestRow>();
    const rankedScores = [...((scoresQuery.data ?? []) as ScoreRow[])].sort(
      (left, right) =>
        toNumber(right.electability_multiplier) -
        toNumber(left.electability_multiplier),
    );

    for (const score of rankedScores) {
      const district =
        unwrapDistrict(score.districts) ??
        districtsById.get(score.district_id) ??
        null;
      const link = resolveElectionLink(electionLinks, {
        districtId: score.district_id,
      });
      if (!link) continue;
      const election = elections.find((row) => row.slug === link.slug);
      if (!election || contestsByElection.has(election.id)) continue;

      contestsByElection.set(
        election.id,
        buildContest({
          election,
          district,
          wins: record.wins,
          losses: record.losses,
          eloRating,
          primaryMatch: toNumber(score.ideological_match_pct),
          ideologyVector,
          uncapturedBounty:
            bounties.get(election.id) ?? toNumber(score.total_escrow_pledged),
        }),
      );
    }

    if (contestsByElection.size < TOP_MATCHED_ELECTIONS) {
      const preferredDistrictId =
        profile?.target_district_id ?? stats?.target_district_id ?? null;
      const userVector = toSixAxisVector(ideologyVector);
      const remaining = [...elections].sort((left, right) => {
        const leftPreferred = left.district_id === preferredDistrictId ? 1 : 0;
        const rightPreferred = right.district_id === preferredDistrictId ? 1 : 0;
        if (rightPreferred !== leftPreferred) {
          return rightPreferred - leftPreferred;
        }
        return left.office_name.localeCompare(right.office_name);
      });

      for (const election of remaining) {
        if (contestsByElection.has(election.id)) continue;
        const median = toSixAxisVector(election.median_voter_vector);
        const primaryMatch = sixAxisMatchPercent(userVector, median);
        contestsByElection.set(
          election.id,
          buildContest({
            election,
            district: election.district_id
              ? (districtsById.get(election.district_id) ?? null)
              : null,
            wins: record.wins,
            losses: record.losses,
            eloRating,
            primaryMatch,
            ideologyVector,
            uncapturedBounty: bounties.get(election.id) ?? 0,
          }),
        );
        if (contestsByElection.size >= TOP_MATCHED_ELECTIONS) break;
      }
    }

    const contests = [...contestsByElection.values()]
      .sort((left, right) => {
        if (right.draftViability !== left.draftViability) {
          return right.draftViability - left.draftViability;
        }
        if (right.primaryMatch !== left.primaryMatch) {
          return right.primaryMatch - left.primaryMatch;
        }
        return left.officeName.localeCompare(right.officeName);
      })
      .slice(0, TOP_MATCHED_ELECTIONS);

    return {
      signedIn: true,
      profile: dashboardProfile,
      contests,
      error: null,
    };
  },
);
