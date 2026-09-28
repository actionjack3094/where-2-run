import { parseElo } from "@/lib/arena/elo";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { createServerSupabase } from "@/lib/db/supabase-server";

export type BoardPerson = {
  id: string;
  name: string;
  elo: number;
  rank: number;
  isViewer: boolean;
};

export type MatchedElection = {
  id: string;
  name: string;
  slug: string | null;
};

export type GrassrootsPolicy = {
  id: string;
  title: string;
  votes: number;
  comments: number;
  engagement: number;
};

export type CompetitiveArena = {
  id: string;
  name: string;
  slug: string | null;
  spread: number;
  contenders: { name: string; elo: number }[];
};

export type LeaderboardDashboard = {
  matched: {
    signedIn: boolean;
    elections: MatchedElection[];
    rank: number | null;
    elo: number | null;
    fieldSize: number;
    board: BoardPerson[];
    error: string | null;
  };
  warRoom: {
    people: BoardPerson[];
    error: string | null;
  };
  grassroots: {
    signedIn: boolean;
    policies: GrassrootsPolicy[];
    error: string | null;
  };
  arenas: {
    races: CompetitiveArena[];
    error: string | null;
  };
};

type UserRow = {
  id: string;
  username: string | null;
  elo_rating: number | string | null;
  target_district_id: string | null;
};

type ElectionRow = {
  id: string;
  slug: string | null;
  office_name: string | null;
  district_id: string | null;
  ocd_id: string | null;
};

type DebateRow = {
  id: string;
  topic: string | null;
  election_id: string | null;
  district_id: string | null;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
};

function nameOf(username: string | null | undefined) {
  const trimmed = username?.trim();
  return trimmed || "Unnamed candidate";
}

function asOcdArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function rankPeople(rows: UserRow[], viewerId: string | null): BoardPerson[] {
  const sorted = [...rows].sort((left, right) => {
    const eloGap = parseElo(right.elo_rating) - parseElo(left.elo_rating);
    if (eloGap !== 0) return eloGap;
    return nameOf(left.username).localeCompare(nameOf(right.username));
  });
  return sorted.map((row, index) => ({
    id: row.id,
    name: nameOf(row.username),
    elo: parseElo(row.elo_rating),
    rank: index + 1,
    isViewer: row.id === viewerId,
  }));
}

export async function loadLeaderboardDashboard(
  userId: string | null,
): Promise<LeaderboardDashboard> {
  const empty: LeaderboardDashboard = {
    matched: {
      signedIn: Boolean(userId),
      elections: [],
      rank: null,
      elo: null,
      fieldSize: 0,
      board: [],
      error: null,
    },
    warRoom: { people: [], error: null },
    grassroots: { signedIn: Boolean(userId), policies: [], error: null },
    arenas: { races: [], error: null },
  };

  const supabase = await createServerSupabase();
  const [meQuery, usersQuery, electionsQuery, districtsQuery, debatesQuery] = await Promise.all([
    userId
      ? supabase
          .from("users")
          .select("matched_ocd_ids, home_ocd_ids, elo_rating")
          .eq("id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("users").select("id, username, elo_rating, target_district_id"),
    supabase.from("elections").select("id, slug, office_name, district_id, ocd_id"),
    supabase.from("districts").select("id, ocd_id, name"),
    supabase
      .from("debates")
      .select("id, topic, election_id, district_id, candidate_a_id, candidate_b_id"),
  ]);

  if (usersQuery.error) empty.warRoom.error = usersQuery.error.message;
  if (electionsQuery.error) {
    empty.matched.error = electionsQuery.error.message;
    empty.arenas.error = electionsQuery.error.message;
  }
  if (debatesQuery.error) {
    empty.grassroots.error = debatesQuery.error.message;
    empty.arenas.error = empty.arenas.error ?? debatesQuery.error.message;
  }

  const users = (usersQuery.data ?? []) as UserRow[];
  const elections = (electionsQuery.data ?? []) as ElectionRow[];
  const debates = (debatesQuery.data ?? []) as DebateRow[];
  const districts = (districtsQuery.data ?? []) as {
    id: string;
    ocd_id: string | null;
    name: string | null;
  }[];
  const me = meQuery.data as {
    matched_ocd_ids?: unknown;
    home_ocd_ids?: unknown;
    elo_rating?: number | string | null;
  } | null;

  const byElo = [...users].sort((left, right) => parseElo(right.elo_rating) - parseElo(left.elo_rating));
  empty.warRoom.people = rankPeople(byElo.slice(0, 10), userId);

  const usersById = new Map(users.map((row) => [row.id, row]));
  const matchedWanted = new Set(asOcdArray(me?.matched_ocd_ids).map((id) => normalizeOcdId(id)));
  const homeWanted = new Set(asOcdArray(me?.home_ocd_ids).map((id) => normalizeOcdId(id)));

  const districtOcd = new Map(
    districts.map((row) => [row.id, normalizeOcdId(row.ocd_id)]),
  );

  function electionMatches(election: ElectionRow, wanted: Set<string>) {
    if (wanted.size === 0) return false;
    if (wanted.has(normalizeOcdId(election.ocd_id))) return true;
    return Boolean(election.district_id && wanted.has(districtOcd.get(election.district_id) ?? ""));
  }

  const matchedElections = elections.filter((row) => electionMatches(row, matchedWanted));
  const matchedElectionIds = new Set(matchedElections.map((row) => row.id));
  const matchedDistrictIds = new Set(
    matchedElections
      .map((row) => row.district_id)
      .filter((id): id is string => Boolean(id)),
  );
  for (const district of districts) {
    if (matchedWanted.has(normalizeOcdId(district.ocd_id))) matchedDistrictIds.add(district.id);
  }

  empty.matched.elections = matchedElections.map((row) => ({
    id: row.id,
    name: row.office_name?.trim() || "Open race",
    slug: row.slug,
  }));

  if (userId && matchedWanted.size > 0) {
    const contenderIds = new Set<string>([userId]);
    for (const user of users) {
      if (user.target_district_id && matchedDistrictIds.has(user.target_district_id)) {
        contenderIds.add(user.id);
      }
    }
    for (const debate of debates) {
      const inField =
        (debate.election_id && matchedElectionIds.has(debate.election_id)) ||
        (debate.district_id && matchedDistrictIds.has(debate.district_id));
      if (!inField) continue;
      if (debate.candidate_a_id) contenderIds.add(debate.candidate_a_id);
      if (debate.candidate_b_id) contenderIds.add(debate.candidate_b_id);
    }
    const field = [...contenderIds]
      .map((id) => usersById.get(id))
      .filter((row): row is UserRow => Boolean(row));
    if (!field.some((row) => row.id === userId) && me) {
      field.push({
        id: userId,
        username: null,
        elo_rating: me.elo_rating ?? null,
        target_district_id: null,
      });
    }
    const board = rankPeople(field, userId);
    const viewer = board.find((person) => person.isViewer) ?? null;
    const preview = board.slice(0, 12);
    if (viewer && !preview.some((person) => person.isViewer)) preview.push(viewer);
    empty.matched.board = preview;
    empty.matched.rank = viewer?.rank ?? null;
    empty.matched.elo = viewer?.elo ?? parseElo(me?.elo_rating);
    empty.matched.fieldSize = board.length;
  }

  const homeElectionIds = new Set(
    elections.filter((row) => electionMatches(row, homeWanted)).map((row) => row.id),
  );
  const homeDistrictIds = new Set(
    districts
      .filter((row) => homeWanted.has(normalizeOcdId(row.ocd_id)))
      .map((row) => row.id),
  );
  const grassrootsDebates = debates.filter(
    (debate) =>
      (debate.election_id && homeElectionIds.has(debate.election_id)) ||
      (debate.district_id && homeDistrictIds.has(debate.district_id)),
  );

  if (userId && grassrootsDebates.length > 0 && !debatesQuery.error) {
    const ids = grassrootsDebates.map((debate) => debate.id);
    const [votesQuery, commentsQuery] = await Promise.all([
      supabase.from("votes").select("debate_id").in("debate_id", ids),
      supabase.from("comments").select("debate_id").in("debate_id", ids),
    ]);
    if (votesQuery.error) empty.grassroots.error = votesQuery.error.message;
    if (commentsQuery.error) empty.grassroots.error = empty.grassroots.error ?? commentsQuery.error.message;

    const voteCounts = new Map<string, number>();
    const commentCounts = new Map<string, number>();
    for (const row of (votesQuery.data ?? []) as { debate_id: string }[]) {
      voteCounts.set(row.debate_id, (voteCounts.get(row.debate_id) ?? 0) + 1);
    }
    for (const row of (commentsQuery.data ?? []) as { debate_id: string }[]) {
      commentCounts.set(row.debate_id, (commentCounts.get(row.debate_id) ?? 0) + 1);
    }

    empty.grassroots.policies = grassrootsDebates
      .map((debate) => {
        const votes = voteCounts.get(debate.id) ?? 0;
        const comments = commentCounts.get(debate.id) ?? 0;
        return {
          id: debate.id,
          title: debate.topic?.trim() || "Untitled debate",
          votes,
          comments,
          engagement: votes + comments,
        };
      })
      .sort((left, right) => right.engagement - left.engagement || left.title.localeCompare(right.title))
      .slice(0, 10);
  }

  if (!electionsQuery.error && !usersQuery.error) {
    const contendersByElection = new Map<string, Set<string>>();
    function addContender(electionId: string, userIdToAdd: string | null) {
      if (!userIdToAdd) return;
      const set = contendersByElection.get(electionId) ?? new Set<string>();
      set.add(userIdToAdd);
      contendersByElection.set(electionId, set);
    }

    for (const user of users) {
      if (!user.target_district_id) continue;
      for (const election of elections) {
        if (election.district_id === user.target_district_id) addContender(election.id, user.id);
      }
    }
    for (const debate of debates) {
      const election =
        elections.find((row) => row.id === debate.election_id) ??
        elections.find((row) => row.district_id && row.district_id === debate.district_id);
      if (!election) continue;
      addContender(election.id, debate.candidate_a_id);
      addContender(election.id, debate.candidate_b_id);
    }

    const races: CompetitiveArena[] = [];
    for (const election of elections) {
      const ids = [...(contendersByElection.get(election.id) ?? [])];
      const field = ids
        .map((id) => usersById.get(id))
        .filter((row): row is UserRow => Boolean(row))
        .sort((left, right) => parseElo(right.elo_rating) - parseElo(left.elo_rating));
      if (field.length < 3) continue;
      const top = field.slice(0, 3);
      races.push({
        id: election.id,
        name: election.office_name?.trim() || "Open race",
        slug: election.slug,
        spread: parseElo(top[0].elo_rating) - parseElo(top[2].elo_rating),
        contenders: top.map((row) => ({
          name: nameOf(row.username),
          elo: parseElo(row.elo_rating),
        })),
      });
    }

    empty.arenas.races = races
      .sort((left, right) => left.spread - right.spread || left.name.localeCompare(right.name))
      .slice(0, 8);
  }

  return empty;
}
