import { cache } from "react";
import { JURY_QUORUM } from "@/lib/actions/jury-resolution";
import { checkLocalEligibility, normalizeOcdId } from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";

type AdminClient = ReturnType<typeof createAdminClient>;

const LOOKUP_CHUNK = 150;

export type PendingJuryAppeal = {
  id: string;
  debateId: string;
  topic: string;
  reason: string;
  verdicts: number;
  quorum: number;
  createdAt: string;
};

type AppealRow = {
  id: string;
  debate_id: string;
  appellant_id: string | null;
  reason: string | null;
  created_at: string;
};

type DebateRow = {
  id: string;
  topic: string;
  election_id: string | null;
  election_question_id: string | null;
  district_id: string | null;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
};

function asOcdIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function chunk<T>(values: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

async function viewerOcdIds(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("tier2_verifications")
    .select("ocd_ids")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(error.message);
  }
  return asOcdIds(data?.ocd_ids);
}

async function loadDebates(admin: AdminClient, debateIds: string[]) {
  const debates = new Map<string, DebateRow>();
  for (const ids of chunk(debateIds, LOOKUP_CHUNK)) {
    const { data, error } = await admin
      .from("debates")
      .select(
        "id, topic, election_id, election_question_id, district_id, candidate_a_id, candidate_b_id",
      )
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as DebateRow[]) debates.set(row.id, row);
  }
  return debates;
}

async function loadDebateDistricts(admin: AdminClient, debates: DebateRow[]) {
  const questionIds = [
    ...new Set(
      debates
        .map((row) => row.election_question_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const questionElection = new Map<string, string | null>();
  const questionPrompt = new Map<string, string>();
  for (const ids of chunk(questionIds, LOOKUP_CHUNK)) {
    const { data, error } = await admin
      .from("election_questions")
      .select("id, election_id, prompt")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      questionElection.set(row.id, row.election_id ?? null);
      const prompt = row.prompt?.trim();
      if (prompt) questionPrompt.set(row.id, prompt);
    }
  }

  const electionIds = [
    ...new Set(
      debates
        .map((row) => {
          if (row.election_id) return row.election_id;
          if (!row.election_question_id) return null;
          return questionElection.get(row.election_question_id) ?? null;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const elections = new Map<string, { ocd_id: string | null; district_id: string | null }>();
  for (const ids of chunk(electionIds, LOOKUP_CHUNK)) {
    const { data, error } = await admin
      .from("elections")
      .select("id, ocd_id, district_id")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      elections.set(row.id, { ocd_id: row.ocd_id ?? null, district_id: row.district_id ?? null });
    }
  }

  const districtIds = new Set<string>();
  for (const debate of debates) {
    const electionId =
      debate.election_id ??
      (debate.election_question_id ? questionElection.get(debate.election_question_id) : null);
    const election = electionId ? elections.get(electionId) : null;
    if (normalizeOcdId(election?.ocd_id)) continue;
    const districtId = election?.district_id ?? debate.district_id;
    if (districtId) districtIds.add(districtId);
  }

  const districts = new Map<string, string | null>();
  for (const ids of chunk([...districtIds], LOOKUP_CHUNK)) {
    const { data, error } = await admin.from("districts").select("id, ocd_id").in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) districts.set(row.id, row.ocd_id ?? null);
  }

  const ocdByDebate = new Map<string, string | null>();
  for (const debate of debates) {
    const electionId =
      debate.election_id ??
      (debate.election_question_id ? questionElection.get(debate.election_question_id) : null);
    const election = electionId ? elections.get(electionId) : null;
    const direct = normalizeOcdId(election?.ocd_id);
    if (direct) {
      ocdByDebate.set(debate.id, direct);
      continue;
    }
    const districtId = election?.district_id ?? debate.district_id;
    ocdByDebate.set(debate.id, districtId ? normalizeOcdId(districts.get(districtId)) || null : null);
  }

  return { ocdByDebate, questionPrompt };
}

/**
 * Pending jury appeals a verified constituent can still vote on: same district,
 * not the appellant or a seated candidate, and not already decided by them.
 */
export const getPendingAppealsForUser = cache(async function getPendingAppealsForUser(): Promise<
  PendingJuryAppeal[]
> {
  const user = await getServerUser();
  if (!user) return [];

  try {
    const admin = createAdminClient();
    const ocdIds = await viewerOcdIds(admin, user.id);
    if (ocdIds.length === 0) return [];

    const { data: appealRows, error: appealError } = await admin
      .from("jury_appeals")
      .select("id, debate_id, appellant_id, reason, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (appealError) {
      if (isMissingRelation(appealError)) return [];
      throw new Error(appealError.message);
    }

    const appeals = ((appealRows ?? []) as AppealRow[]).filter(
      (row) => row.appellant_id != null && row.appellant_id !== user.id,
    );
    if (appeals.length === 0) return [];

    const debates = await loadDebates(admin, [...new Set(appeals.map((row) => row.debate_id))]);
    const contestable = appeals.filter((appeal) => {
      const debate = debates.get(appeal.debate_id);
      if (!debate) return false;
      return debate.candidate_a_id !== user.id && debate.candidate_b_id !== user.id;
    });
    if (contestable.length === 0) return [];

    const appealIds = contestable.map((row) => row.id);
    const verdictsByAppeal = new Map<string, number>();
    const voted = new Set<string>();
    for (const ids of chunk(appealIds, LOOKUP_CHUNK)) {
      const { data, error } = await admin
        .from("jury_verdicts")
        .select("appeal_id, juror_id")
        .in("appeal_id", ids);
      if (error) {
        if (isMissingRelation(error)) break;
        throw new Error(error.message);
      }
      for (const row of data ?? []) {
        verdictsByAppeal.set(row.appeal_id, (verdictsByAppeal.get(row.appeal_id) ?? 0) + 1);
        if (row.juror_id === user.id) voted.add(row.appeal_id);
      }
    }

    const remaining = contestable.filter((row) => !voted.has(row.id));
    if (remaining.length === 0) return [];

    const remainingDebates = [
      ...new Map(
        remaining
          .map((row) => debates.get(row.debate_id))
          .filter((row): row is DebateRow => Boolean(row))
          .map((row) => [row.id, row]),
      ).values(),
    ];
    const { ocdByDebate, questionPrompt } = await loadDebateDistricts(admin, remainingDebates);

    const feed: PendingJuryAppeal[] = [];
    for (const appeal of remaining) {
      const debate = debates.get(appeal.debate_id);
      if (!debate) continue;
      if (!checkLocalEligibility(ocdIds, ocdByDebate.get(debate.id) ?? null)) continue;
      const questionPromptText = debate.election_question_id
        ? questionPrompt.get(debate.election_question_id)
        : null;
      feed.push({
        id: appeal.id,
        debateId: debate.id,
        topic: questionPromptText || debate.topic.trim() || "Untitled question",
        reason: appeal.reason?.trim() || "No written grounds were filed.",
        verdicts: verdictsByAppeal.get(appeal.id) ?? 0,
        quorum: JURY_QUORUM,
        createdAt: appeal.created_at,
      });
    }
    return feed;
  } catch (caught) {
    console.error("getPendingAppealsForUser failed.", caught);
    return [];
  }
});
