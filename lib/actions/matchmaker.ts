import { parseElo } from "@/lib/actions/elo";
import { loadEndorsementCounts } from "@/lib/candidate-endorsements";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { inferPartisanLean } from "@/lib/ideology/match";
import { toSixAxisVector } from "@/lib/ideology/six-axis";
import { cosineDistanceToMatchPercent } from "@/lib/ideology/stance";
import {
  cosineDistance,
  normalizeVector,
  parseVector,
  similarityToPercent,
} from "@/lib/ideology/vector";
/** RPC cap in `find_ideological_matches` / `find_primary_opponents`. */
const MATCH_LIMIT = 25;
/** Closest primary elections nationwide a candidate is seated into. */
const TOURNAMENT_PLACEMENT_LIMIT = 8;

export type IdeologicalMatch = {
  id: string;
  name: string;
  elo: number;
  alignmentScore: number;
  /** Incoming coalition endorsements (0 when none). */
  endorsements: number;
};

export type TournamentPlacement = {
  electionId: string;
  officeName: string;
  slug: string;
  alignmentScore: number;
  elo: number;
  matchesPlayed: number;
};

export type MatchmakerPlacement = {
  matches: IdeologicalMatch[];
  tournaments: TournamentPlacement[];
};

type IdeologyRow = {
  user_id: string;
  vector_data: unknown;
  scores?: unknown;
};

type ElectionIdeologyRow = {
  id: string;
  slug: string;
  office_name: string;
  pvi_score?: number | null;
  primary_rep_vector?: unknown;
  primary_dem_vector?: unknown;
  general_vector?: unknown;
  median_voter_vector?: unknown;
};

type TournamentRow = {
  election_id: string;
  elo_rating: number | string | null;
  matches_played: number | string | null;
};

type OpponentRow = {
  id: string;
  username?: string | null;
  elo_rating?: number | string | null;
  cosine_distance?: number | string | null;
};

function hasIdeology(value: unknown) {
  return parseVector(value).some((entry) => Number.isFinite(entry) && entry !== 0);
}

function ideologyDistance(userVector: number[], election: ElectionIdeologyRow) {
  const lean = inferPartisanLean(normalizeVector(userVector));
  const primary =
    lean === "D" ? election.primary_dem_vector : election.primary_rep_vector;
  const primaryVector = parseVector(primary);
  const fallback = parseVector(election.general_vector ?? election.median_voter_vector);
  const target = primaryVector.length ? primaryVector : fallback;
  if (!target.length) return Number.POSITIVE_INFINITY;

  const userSix = toSixAxisVector(userVector);
  const seatSix = toSixAxisVector(target);
  return cosineDistance(userSix, seatSix);
}

async function loadUserIdeology(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
) {
  const { data: ideology } = await supabase
    .from("user_ideologies")
    .select("user_id, vector_data, scores")
    .eq("user_id", userId)
    .maybeSingle();

  const row = ideology as IdeologyRow | null;
  if (row && hasIdeology(row.vector_data)) {
    return normalizeVector(parseVector(row.vector_data));
  }

  const { data: profile } = await supabase
    .from("users")
    .select("ideology_vector")
    .eq("id", userId)
    .maybeSingle();

  const vector = parseVector(
    (profile as { ideology_vector?: unknown } | null)?.ideology_vector,
  );
  if (!hasIdeology(vector)) return null;

  const normalized = normalizeVector(vector);
  await supabase.from("user_ideologies").upsert({
    user_id: userId,
    vector_data: `[${normalized.map((value) => value.toFixed(6)).join(",")}]`,
    scores: normalized,
    updated_at: new Date().toISOString(),
  });
  return normalized;
}

/**
 * Seat the caller into the closest primary elections nationwide.
 * Physical location is ignored — only ideological distance matters.
 */
export async function placeIntoPrimaryTournaments(
  userId?: string,
): Promise<TournamentPlacement[]> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = userId ?? user?.id;
  if (!viewerId || (user?.id && viewerId !== user.id)) return [];

  const vector = await loadUserIdeology(supabase, viewerId);
  if (!vector) return [];

  const { data: electionRows, error: electionError } = await supabase
    .from("elections")
    .select(
      "id, slug, office_name, pvi_score, primary_rep_vector, primary_dem_vector, general_vector, median_voter_vector",
    );

  if (electionError) {
    throw new Error(electionError.message);
  }

  const ranked = ((electionRows ?? []) as ElectionIdeologyRow[])
    .map((election) => ({
      election,
      distance: ideologyDistance(vector, election),
    }))
    .filter((row) => Number.isFinite(row.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, TOURNAMENT_PLACEMENT_LIMIT);

  if (ranked.length === 0) return [];

  const upserts = ranked.map((row) => ({
    user_id: viewerId,
    election_id: row.election.id,
  }));

  const { error: upsertError } = await supabase
    .from("tournament_participants")
    .upsert(upserts, { onConflict: "user_id,election_id", ignoreDuplicates: true });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const { data: participantRows, error: participantError } = await supabase
    .from("tournament_participants")
    .select("election_id, elo_rating, matches_played")
    .eq("user_id", viewerId)
    .in(
      "election_id",
      ranked.map((row) => row.election.id),
    );

  if (participantError) {
    throw new Error(participantError.message);
  }

  const byElection = new Map(
    ((participantRows ?? []) as TournamentRow[]).map((row) => [row.election_id, row]),
  );

  return ranked.map((row) => {
    const participant = byElection.get(row.election.id);
    return {
      electionId: row.election.id,
      officeName: row.election.office_name,
      slug: row.election.slug,
      alignmentScore: similarityToPercent(1 - row.distance),
      elo: parseElo(participant?.elo_rating),
      matchesPlayed: Math.max(0, Number(participant?.matches_played) || 0),
    };
  });
}

async function loadIdeologicalOpponents(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
): Promise<OpponentRow[]> {
  const ideological = await supabase.rpc("find_ideological_matches", {
    p_user_id: userId,
    match_count: MATCH_LIMIT,
  });

  if (!ideological.error) {
    return (ideological.data ?? []) as OpponentRow[];
  }

  const legacy = await supabase.rpc("find_primary_opponents", {
    p_user_id: userId,
    match_count: MATCH_LIMIT,
  });

  if (legacy.error) {
    throw new Error(ideological.error.message || legacy.error.message);
  }

  return (legacy.data ?? []) as OpponentRow[];
}

/**
 * Nationwide ideological pairing. Closest vectors first; district is not a filter.
 * Also seats the caller into the nearest primary tournaments.
 */
export async function getIdeologicalMatches(): Promise<IdeologicalMatch[]> {
  const placed = await getMatchmakerPlacement();
  return placed.matches;
}

export async function getMatchmakerPlacement(): Promise<MatchmakerPlacement> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { matches: [], tournaments: [] };

  const vector = await loadUserIdeology(supabase, user.id);
  if (!vector) return { matches: [], tournaments: [] };

  const [rows, tournaments] = await Promise.all([
    loadIdeologicalOpponents(supabase, user.id),
    placeIntoPrimaryTournaments(user.id),
  ]);

  const endorsementCounts = await loadEndorsementCounts(rows.map((row) => row.id));

  const matches = rows
    .slice()
    .sort((a, b) => Number(a.cosine_distance) - Number(b.cosine_distance))
    .map((row) => ({
      id: row.id,
      name: row.username?.trim() || "Unnamed candidate",
      elo: parseElo(row.elo_rating),
      alignmentScore: cosineDistanceToMatchPercent(Number(row.cosine_distance)),
      endorsements: endorsementCounts.get(row.id) ?? 0,
    }));

  return { matches, tournaments };
}
