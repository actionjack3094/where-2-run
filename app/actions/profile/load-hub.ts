"use server";

import { parseElo } from "@/lib/arena/elo";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createServerSupabase, getServerUser } from "@/lib/db/supabase-server";
import { unlockConditionLabel } from "@/lib/escrow";
import { toNumber } from "@/lib/electability";
import { parseVector } from "@/lib/ideology/vector";
import { recordFromStats } from "@/lib/leaderboard";
import { parseAmount } from "@/lib/pledges";
import type {
  CoalitionContact,
  DraftBounty,
  MatchedElection,
  ProfileHub,
} from "@/lib/profile/hub";
import type { CampaignPledge, FilingRequirements } from "@/types/database.types";

type PledgeRow = Pick<
  CampaignPledge,
  "id" | "donor_id" | "amount" | "election_id" | "status"
> & {
  unlock_condition?: string | null;
};

type ElectionRow = {
  id: string;
  office_name: string;
  district_id: string | null;
  filing_requirements: unknown;
};

type PersonRow = {
  id: string;
  username: string | null;
  ideology_vector: unknown;
};

function asRequirements(value: unknown): FilingRequirements {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as FilingRequirements;
  }
  return {};
}

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

function displayName(username: string | null | undefined, id: string, fallback: string) {
  const trimmed = username?.trim();
  if (trimmed) return trimmed;
  return `${fallback} ${id.slice(0, 6)}`;
}

export async function loadProfileHub(): Promise<ProfileHub> {
  const user = await getServerUser();
  if (!user) return { signedIn: false };

  const supabase = await createServerSupabase();
  const [profileQuery, statsQuery, candidateQuery, scoresQuery, electionsQuery] =
    await Promise.all([
      supabase
        .from("users")
        .select(
          "id, username, ideology_vector, elo_rating, target_district_id, residency_state",
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("candidate_stats")
        .select("username, ideology_vector, elo_rating, debates_won, debates_played")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("candidates").select("bio, ideology_vector").eq("id", user.id).maybeSingle(),
      supabase
        .from("electability_scores")
        .select("district_id, electability_multiplier")
        .eq("user_id", user.id),
      supabase
        .from("elections")
        .select("id, office_name, district_id, filing_requirements"),
    ]);

  const fatal =
    (profileQuery.error && !isMissingRelation(profileQuery.error)
      ? profileQuery.error.message
      : null) ??
    (statsQuery.error && !isMissingRelation(statsQuery.error)
      ? statsQuery.error.message
      : null);

  const profile = profileQuery.data as {
    username?: string | null;
    ideology_vector?: unknown;
    elo_rating?: number | null;
    target_district_id?: string | null;
    residency_state?: string | null;
  } | null;
  const stats = statsQuery.data as {
    username?: string | null;
    ideology_vector?: unknown;
    elo_rating?: number | null;
    debates_won?: number | null;
    debates_played?: number | null;
  } | null;
  const candidate = candidateQuery.error
    ? null
    : (candidateQuery.data as { bio?: string | null; ideology_vector?: unknown } | null);

  const record = recordFromStats({
    debates_won: stats?.debates_won ?? 0,
    debates_played: stats?.debates_played ?? 0,
  });

  const ideologyVector = parseVector(
    profile?.ideology_vector ?? candidate?.ideology_vector ?? stats?.ideology_vector,
  );

  const elections = electionsQuery.error
    ? []
    : ((electionsQuery.data ?? []) as ElectionRow[]);
  const electionsById = new Map(elections.map((row) => [row.id, row]));

  const rankedDistrictId = [...(scoresQuery.data ?? [])]
    .sort(
      (left, right) =>
        toNumber(
          (right as { electability_multiplier?: number | string }).electability_multiplier,
        ) -
        toNumber(
          (left as { electability_multiplier?: number | string }).electability_multiplier,
        ),
    )
    .map((row) => (row as { district_id?: string | null }).district_id ?? null)
    .find((id): id is string => Boolean(id));

  const targetDistrictId = profile?.target_district_id ?? null;
  const matched =
    (targetDistrictId
      ? elections.find((row) => row.district_id === targetDistrictId)
      : null) ??
    (rankedDistrictId
      ? elections.find((row) => row.district_id === rankedDistrictId)
      : null) ??
    null;

  let district: { level?: string | null; state?: string | null } | null = null;
  const districtId = matched?.district_id ?? targetDistrictId ?? rankedDistrictId ?? null;
  if (districtId) {
    const districtQuery = await supabase
      .from("districts")
      .select("level, state")
      .eq("id", districtId)
      .maybeSingle();
    if (!districtQuery.error) {
      district = districtQuery.data as { level?: string | null; state?: string | null } | null;
    }
  }

  const requirements = asRequirements(matched?.filing_requirements);
  const election: MatchedElection | null = matched
    ? {
        id: matched.id,
        officeName: matched.office_name,
        level: requirements.level ?? district?.level ?? "local",
        state: requirements.state ?? district?.state ?? profile?.residency_state ?? null,
      }
    : null;

  const pledges = await loadUncapturedBounties(user.id);
  const allies = await loadAllyIds(user.id);
  const followerIds = [
    ...new Set(
      pledges
        .map((row) => row.donor_id)
        .filter((id) => id && id !== user.id && !allies.has(id)),
    ),
  ];
  const people = await loadPeople([...allies, ...followerIds]);
  const peopleById = new Map(people.map((row) => [row.id, row]));

  const bounties: DraftBounty[] = pledges.map((row) => ({
    id: row.id,
    amount: parseAmount(row.amount),
    unlockLabel: unlockConditionLabel(row.unlock_condition) ?? "Ballot filing",
    officeName: electionsById.get(row.election_id)?.office_name ?? null,
    donorName: displayName(peopleById.get(row.donor_id)?.username, row.donor_id, "Supporter"),
  }));

  const network: CoalitionContact[] = [
    ...[...allies].map((id) => toContact(id, "ally", peopleById)),
    ...followerIds.map((id) => toContact(id, "follower", peopleById)),
  ];

  const bio = candidate?.bio?.trim() || null;

  return {
    signedIn: true,
    userId: user.id,
    username:
      profile?.username?.trim() ||
      stats?.username?.trim() ||
      user.email?.split("@")[0] ||
      "Candidate",
    bio,
    wins: record.wins,
    losses: record.losses,
    eloRating: parseElo(stats?.elo_rating ?? profile?.elo_rating),
    ideologyVector,
    bounties,
    election,
    network,
    error: fatal,
  };
}

function toContact(
  id: string,
  role: CoalitionContact["role"],
  peopleById: Map<string, PersonRow>,
): CoalitionContact {
  const person = peopleById.get(id);
  return {
    id,
    name: displayName(person?.username, id, role === "ally" ? "Ally" : "Follower"),
    role,
    ideologyVector: parseVector(person?.ideology_vector),
  };
}

async function loadAllyIds(userId: string) {
  const allies = new Set<string>();
  const supabase = await createServerSupabase();
  const memberships = await supabase
    .from("coalition_members")
    .select("coalition_id")
    .eq("candidate_id", userId)
    .eq("status", "active");

  if (memberships.error) {
    if (isMissingRelation(memberships.error)) return allies;
    return allies;
  }

  const coalitionIds = [
    ...new Set(
      ((memberships.data ?? []) as { coalition_id: string }[]).map((row) => row.coalition_id),
    ),
  ];
  if (coalitionIds.length === 0) return allies;

  const seats = await supabase
    .from("coalition_members")
    .select("candidate_id")
    .in("coalition_id", coalitionIds)
    .eq("status", "active");

  if (seats.error || !seats.data) return allies;

  for (const seat of seats.data as { candidate_id: string }[]) {
    if (seat.candidate_id !== userId) allies.add(seat.candidate_id);
  }
  return allies;
}

async function loadPeople(ids: string[]) {
  if (ids.length === 0) return [] as PersonRow[];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("id, username, ideology_vector")
    .in("id", ids);
  if (error || !data) return [] as PersonRow[];
  return data as PersonRow[];
}

async function loadUncapturedBounties(userId: string) {
  const admin = tryAdminClient();
  if (!admin) return [] as PledgeRow[];

  const primary = await admin
    .from("campaign_pledges")
    .select("id, donor_id, amount, election_id, unlock_condition, status")
    .eq("candidate_id", userId)
    .eq("status", "pending");

  if (!primary.error) return (primary.data ?? []) as PledgeRow[];
  if (isMissingRelation(primary.error)) return [] as PledgeRow[];

  if (!/unlock_condition/i.test(primary.error.message ?? "")) {
    console.warn("Could not load uncaptured draft bounties.", primary.error.message);
    return [] as PledgeRow[];
  }

  const fallback = await admin
    .from("campaign_pledges")
    .select("id, donor_id, amount, election_id, status")
    .eq("candidate_id", userId)
    .eq("status", "pending");

  if (fallback.error) {
    if (!isMissingRelation(fallback.error)) {
      console.warn("Could not load uncaptured draft bounties.", fallback.error.message);
    }
    return [] as PledgeRow[];
  }

  return (fallback.data ?? []) as PledgeRow[];
}
