import { parseElo } from "@/lib/arena/elo";
import { isMissingRelation } from "@/lib/coalitions";
import { createServerSupabase } from "@/lib/db/supabase-server";

export type CandidateCoalition = {
  id: string;
  name: string;
  memberCount: number;
};

export type IncomingEndorsement = {
  endorserId: string;
  username: string;
  eloRating: number;
};

export type CandidateCoalitionSummary = {
  coalitions: CandidateCoalition[];
  endorsements: IncomingEndorsement[];
  endorsementCount: number;
};

const ENDORSER_LIMIT = 12;

const EMPTY: CandidateCoalitionSummary = {
  coalitions: [],
  endorsements: [],
  endorsementCount: 0,
};

/**
 * Public coalition standing for a candidate card: the coalitions they are
 * seated in (with member counts) and who has endorsed them. All of it is
 * already public under RLS, so this reads with the caller's own client.
 */
export async function loadCandidateCoalitionSummary(
  candidateId: string,
): Promise<CandidateCoalitionSummary> {
  const supabase = await createServerSupabase();

  const [seats, incoming] = await Promise.all([
    supabase
      .from("coalition_members")
      .select("coalition_id")
      .eq("candidate_id", candidateId)
      .eq("status", "active"),
    supabase
      .from("coalition_endorsements")
      .select("endorser_id", { count: "exact" })
      .eq("endorsed_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(ENDORSER_LIMIT),
  ]);

  for (const result of [seats, incoming]) {
    if (result.error) {
      if (isMissingRelation(result.error)) return EMPTY;
      throw new Error(result.error.message);
    }
  }

  const coalitionIds = [
    ...new Set(((seats.data ?? []) as { coalition_id: string }[]).map((row) => row.coalition_id)),
  ];
  const endorserIds = ((incoming.data ?? []) as { endorser_id: string }[]).map(
    (row) => row.endorser_id,
  );

  const [coalitionRows, memberRows, people] = await Promise.all([
    coalitionIds.length > 0
      ? supabase.from("coalitions").select("id, name").in("id", coalitionIds).order("name")
      : Promise.resolve({ data: [], error: null }),
    coalitionIds.length > 0
      ? supabase
          .from("coalition_members")
          .select("coalition_id")
          .in("coalition_id", coalitionIds)
          .eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    endorserIds.length > 0
      ? supabase.from("users").select("id, username, elo_rating").in("id", endorserIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [coalitionRows, memberRows, people]) {
    if (result.error) throw new Error(result.error.message);
  }

  const counts = new Map<string, number>();
  for (const row of (memberRows.data ?? []) as { coalition_id: string }[]) {
    counts.set(row.coalition_id, (counts.get(row.coalition_id) ?? 0) + 1);
  }
  const byId = new Map(
    ((people.data ?? []) as { id: string; username: string | null; elo_rating: number | null }[]).map(
      (row) => [row.id, row],
    ),
  );

  return {
    coalitions: ((coalitionRows.data ?? []) as { id: string; name: string }[]).map((row) => ({
      id: row.id,
      name: row.name,
      memberCount: counts.get(row.id) ?? 0,
    })),
    endorsements: endorserIds.map((id) => ({
      endorserId: id,
      username: byId.get(id)?.username?.trim() || `Candidate ${id.slice(0, 6)}`,
      eloRating: parseElo(byId.get(id)?.elo_rating),
    })),
    endorsementCount: incoming.count ?? endorserIds.length,
  };
}
