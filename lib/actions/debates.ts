import { parseElo } from "@/lib/arena/elo";
import { formatOcdDivision, readElectionOcdId } from "@/lib/civic-fencing";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { type DiscoveryDebate, type DiscoverySeat } from "@/lib/debates/discovery";

type SeatJoin = {
  id: string;
  username: string | null;
  elo_rating: number | string | null;
};

type DistrictJoin = {
  id: string;
  name: string | null;
  ocd_id: string | null;
};

type ElectionJoin = {
  id: string;
  slug: string | null;
  office_name: string | null;
  ocd_id: string | null;
};

type DebateQueryRow = {
  id: string;
  topic: string;
  status: string;
  created_at: string;
  district_id: string | null;
  election_id: string | null;
  winner_id: string | null;
  judge_reasoning?: string | null;
  candidate_a: SeatJoin | SeatJoin[] | null;
  candidate_b: SeatJoin | SeatJoin[] | null;
  district?: DistrictJoin | DistrictJoin[] | null;
};

const DEBATE_SELECT = `
  id, topic, status, created_at, district_id, election_id, winner_id, judge_reasoning,
  candidate_a:users!debates_candidate_a_id_fkey ( id, username, elo_rating ),
  candidate_b:users!debates_candidate_b_id_fkey ( id, username, elo_rating ),
  district:districts ( id, name, ocd_id )
`;

const DEBATE_SELECT_MINIMAL = `
  id, topic, status, created_at, district_id, election_id, winner_id,
  candidate_a:users!debates_candidate_a_id_fkey ( id, username, elo_rating ),
  candidate_b:users!debates_candidate_b_id_fkey ( id, username, elo_rating ),
  district:districts ( id, name )
`;

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toSeat(value: SeatJoin | SeatJoin[] | null | undefined): DiscoverySeat | null {
  const row = unwrapOne(value);
  if (!row?.id) return null;
  return {
    id: row.id,
    username: row.username?.trim() || "Debater",
    elo: parseElo(row.elo_rating),
  };
}

function countFor(
  votes: { debate_id: string; voted_for_user_id: string | null; selection: string | null }[],
  debateId: string,
  candidateAId: string | null,
  candidateBId: string | null,
) {
  let votesA = 0;
  let votesB = 0;
  for (const vote of votes) {
    if (vote.debate_id !== debateId) continue;
    const choice = vote.selection?.trim() || vote.voted_for_user_id;
    if (choice && choice === candidateAId) votesA += 1;
    else if (choice && choice === candidateBId) votesB += 1;
  }
  return { votesA, votesB };
}

export async function loadDiscoveryDebates(): Promise<{
  debates: DiscoveryDebate[];
  error: string | null;
}> {
  const supabase = await createServerSupabase();
  const full = await supabase
    .from("debates")
    .select(DEBATE_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);

  let rows: DebateQueryRow[];
  if (full.error && isMissingSchema(full.error)) {
    const minimal = await supabase
      .from("debates")
      .select(DEBATE_SELECT_MINIMAL)
      .order("created_at", { ascending: false })
      .limit(200);
    if (minimal.error) return { debates: [], error: minimal.error.message };
    rows = (minimal.data ?? []) as DebateQueryRow[];
  } else if (full.error) {
    return { debates: [], error: full.error.message };
  } else {
    rows = (full.data ?? []) as DebateQueryRow[];
  }
  const electionIds = [
    ...new Set(rows.map((row) => row.election_id).filter((id): id is string => Boolean(id))),
  ];
  const electionsById = new Map<string, ElectionJoin>();
  if (electionIds.length > 0) {
    const elections = await supabase
      .from("elections")
      .select("id, slug, office_name, ocd_id")
      .in("id", electionIds);
    if (!elections.error) {
      for (const election of (elections.data ?? []) as ElectionJoin[]) {
        electionsById.set(election.id, election);
      }
    }
  }

  const debateIds = rows.map((row) => row.id);
  let voteRows: {
    debate_id: string;
    voted_for_user_id: string | null;
    selection: string | null;
  }[] = [];
  if (debateIds.length > 0) {
    const votes = await supabase
      .from("debate_votes")
      .select("debate_id, voted_for_user_id, selection")
      .in("debate_id", debateIds);
    if (!votes.error) {
      voteRows = (votes.data ?? []) as typeof voteRows;
    }
  }

  const debates = rows.map((row) => {
    const district = unwrapOne(row.district);
    const election = row.election_id ? electionsById.get(row.election_id) : undefined;
    const ocdId =
      readElectionOcdId(row.election_id, election?.ocd_id) ||
      district?.ocd_id?.trim() ||
      null;
    const districtTag =
      district?.name?.trim() ||
      election?.office_name?.trim() ||
      formatOcdDivision(ocdId) ||
      "Open district";
    const candidateA = toSeat(row.candidate_a);
    const candidateB = toSeat(row.candidate_b);
    const tally = countFor(voteRows, row.id, candidateA?.id ?? null, candidateB?.id ?? null);
    const debate: DiscoveryDebate = {
      id: row.id,
      topic: row.topic,
      status: row.status,
      createdAt: row.created_at,
      districtTag,
      ocdId,
      electionSlug: election?.slug ?? null,
      candidateA,
      candidateB,
      winnerId: row.winner_id,
      judgeReasoning: row.judge_reasoning?.trim() || null,
      votesA: tally.votesA,
      votesB: tally.votesB,
    };
    return debate;
  });

  debates.sort((left, right) => {
    const activity = right.votesA + right.votesB - (left.votesA + left.votesB);
    if (activity !== 0) return activity;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });

  return { debates, error: null };
}
