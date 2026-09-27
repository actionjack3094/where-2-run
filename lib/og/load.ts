import { parseElo } from "@/lib/arena/elo";
import { isUuid } from "@/lib/arena/display";
import { createServerSupabase } from "@/lib/db/supabase-server";
import type { OgCard } from "@/lib/og/card";

const FALLBACK_DEBATE = {
  kind: "debate" as const,
  topic: "Live floor",
  leftName: "Candidate A",
  rightName: "Candidate B",
  leftElo: 1200,
  rightElo: 1200,
};

async function namesFor(ids: string[]) {
  if (ids.length === 0) return new Map<string, { name: string; elo: number }>();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("id, username, elo_rating")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((row) => [
      row.id,
      { name: row.username?.trim() || "Candidate", elo: parseElo(row.elo_rating) },
    ]),
  );
}

export async function loadDebateCard(debateId: string): Promise<OgCard> {
  if (!isUuid(debateId)) return FALLBACK_DEBATE;
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("debates")
      .select("topic, candidate_a_id, candidate_b_id")
      .eq("id", debateId)
      .maybeSingle();
    if (error || !data) return { ...FALLBACK_DEBATE, topic: "Debate unavailable" };

    const ids = [data.candidate_a_id, data.candidate_b_id].filter(
      (id): id is string => Boolean(id),
    );
    const names = await namesFor(ids);
    const left = data.candidate_a_id ? names.get(data.candidate_a_id) : null;
    const right = data.candidate_b_id ? names.get(data.candidate_b_id) : null;

    return {
      kind: "debate",
      topic: data.topic?.trim() || "Live floor",
      leftName: left?.name ?? "Open seat",
      rightName: right?.name ?? "Open seat",
      leftElo: left?.elo ?? 1200,
      rightElo: right?.elo ?? 1200,
    };
  } catch {
    return FALLBACK_DEBATE;
  }
}

export async function loadCandidateCard(candidateId: string): Promise<OgCard> {
  if (!isUuid(candidateId)) {
    return { kind: "candidate", name: "Candidate", office: "Campaign", elo: 1200 };
  }
  try {
    const supabase = await createServerSupabase();
    const [{ data: user }, { data: ticket }] = await Promise.all([
      supabase.from("users").select("username, elo_rating").eq("id", candidateId).maybeSingle(),
      supabase
        .from("candidates")
        .select("display_name, office_sought")
        .eq("id", candidateId)
        .maybeSingle(),
    ]);

    return {
      kind: "candidate",
      name: ticket?.display_name?.trim() || user?.username?.trim() || "Candidate",
      office: ticket?.office_sought?.trim() || "Campaign",
      elo: parseElo(user?.elo_rating),
    };
  } catch {
    return { kind: "candidate", name: "Candidate", office: "Campaign", elo: 1200 };
  }
}

export async function loadRankingsCard(): Promise<OgCard> {
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("candidate_stats")
      .select("username, elo_rating")
      .order("elo_rating", { ascending: false })
      .limit(5);
    if (error) return { kind: "rankings", rows: [] };
    return {
      kind: "rankings",
      rows: (data ?? []).map((row) => ({
        name: row.username?.trim() || "Candidate",
        elo: parseElo(row.elo_rating),
      })),
    };
  } catch {
    return { kind: "rankings", rows: [] };
  }
}
