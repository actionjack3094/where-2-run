import { debateDistrictOcdId } from "@/lib/actions/debate-resolution";
import { JURY_QUORUM } from "@/lib/actions/jury-resolution";
import { checkLocalEligibility } from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  isResolvedDebate,
  withinAppealWindow,
} from "@/lib/jury-window";
import { roundPairs, type ArgumentRow, type RoundPair } from "@/lib/debates/round-state";
import type { Debate, JuryAppeal } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

function asOcdIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

async function viewerOcdIds(admin: AdminClient, userId: string | null) {
  if (!userId) return [];
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

async function usernameMap(admin: AdminClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const { data, error } = await admin.from("users").select("id, username").in("id", unique);
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as { id: string; username: string }[]).map((row) => [row.id, row.username]),
  );
}

export type DebateAppealDesk = {
  eligible: boolean;
  withinWindow: boolean;
  ownAppealId: string | null;
  pendingAppealId: string | null;
};

export async function loadDebateAppealDesk(
  debate: {
    id: string;
    status: string;
    election_id?: string | null;
    election_question_id?: string | null;
    district_id?: string | null;
    elo_applied_at?: string | null;
    expires_at?: string | null;
    resolved_at?: string | null;
    updated_at?: string | null;
  },
  userId: string | null,
): Promise<DebateAppealDesk> {
  const empty: DebateAppealDesk = {
    eligible: false,
    withinWindow: false,
    ownAppealId: null,
    pendingAppealId: null,
  };
  if (!isResolvedDebate(debate.status)) return empty;

  const admin = createAdminClient();
  const withinWindow = withinAppealWindow(debate);
  const districtOcdId = await debateDistrictOcdId(admin, {
    election_id: debate.election_id ?? null,
    election_question_id: debate.election_question_id ?? null,
    district_id: debate.district_id ?? null,
  });
  const ocdIds = await viewerOcdIds(admin, userId);
  const eligible = Boolean(userId && checkLocalEligibility(ocdIds, districtOcdId));

  const { data, error } = await admin
    .from("jury_appeals")
    .select("id, appellant_id, status, created_at")
    .eq("debate_id", debate.id)
    .not("status", "is", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingRelation(error)) {
      return { eligible, withinWindow, ownAppealId: null, pendingAppealId: null };
    }
    throw new Error(error.message);
  }

  const appeals = (data ?? []) as Pick<JuryAppeal, "id" | "appellant_id" | "status">[];
  const own = userId ? appeals.find((row) => row.appellant_id === userId) : null;
  const pending = appeals.find((row) => row.status === "pending") ?? null;

  return {
    eligible,
    withinWindow,
    ownAppealId: own?.id ?? null,
    pendingAppealId: pending?.id ?? null,
  };
}

export type JuryDeskEligibility =
  | { canVote: true; reason: null }
  | { canVote: false; reason: string };

export type JuryDesk = {
  appeal: Pick<JuryAppeal, "id" | "debate_id" | "appellant_id" | "reason" | "status" | "created_at">;
  debate: Debate;
  prompt: string;
  candidateAName: string;
  candidateBName: string;
  appellantName: string | null;
  rounds: RoundPair[];
  winnerLabel: string;
  districtOcdId: string | null;
  eligibility: JuryDeskEligibility;
  ownVerdict: boolean | null;
  verdicts: number;
  overturnedVotes: number;
  quorum: number;
};

export async function loadJuryDesk(
  appealId: string,
  userId: string | null,
): Promise<JuryDesk | null> {
  const admin = createAdminClient();
  const { data: appealRow, error: appealError } = await admin
    .from("jury_appeals")
    .select("id, debate_id, appellant_id, reason, status, created_at")
    .eq("id", appealId)
    .maybeSingle();
  if (appealError) {
    if (isMissingRelation(appealError)) return null;
    throw new Error(appealError.message);
  }
  const appeal = appealRow as JuryDesk["appeal"] | null;
  if (!appeal || !appeal.status) return null;

  const { data: debateRow, error: debateError } = await admin
    .from("debates")
    .select("*")
    .eq("id", appeal.debate_id)
    .maybeSingle();
  if (debateError) throw new Error(debateError.message);
  const debate = debateRow as Debate | null;
  if (!debate) return null;

  let prompt = debate.topic.trim();
  if (debate.election_question_id) {
    const { data: question } = await admin
      .from("election_questions")
      .select("prompt")
      .eq("id", debate.election_question_id)
      .maybeSingle();
    const questionPrompt = (question as { prompt?: string } | null)?.prompt?.trim();
    if (questionPrompt) prompt = questionPrompt;
  }

  const { data: argumentData, error: argumentError } = await admin
    .from("arguments")
    .select("author_id, round_number, content")
    .eq("debate_id", debate.id)
    .order("round_number", { ascending: true })
    .order("created_at", { ascending: true });
  if (argumentError) throw new Error(argumentError.message);

  const names = await usernameMap(admin, [
    debate.candidate_a_id ?? "",
    debate.candidate_b_id ?? "",
    appeal.appellant_id ?? "",
  ]);

  const { data: verdictRows, error: verdictError } = await admin
    .from("jury_verdicts")
    .select("juror_id, overturned")
    .eq("appeal_id", appeal.id);
  if (verdictError && !isMissingRelation(verdictError)) throw new Error(verdictError.message);
  const verdicts = (verdictRows ?? []) as { juror_id: string; overturned: boolean }[];
  const ownVerdict =
    userId != null ? (verdicts.find((row) => row.juror_id === userId)?.overturned ?? null) : null;

  const districtOcdId = await debateDistrictOcdId(admin, debate);
  const ocdIds = await viewerOcdIds(admin, userId);
  const verified = checkLocalEligibility(ocdIds, districtOcdId);

  let eligibility: JuryDeskEligibility = { canVote: true, reason: null };
  if (!userId) {
    eligibility = { canVote: false, reason: "Sign in to serve on this jury." };
  } else if (appeal.status !== "pending") {
    eligibility = { canVote: false, reason: "This appeal is closed." };
  } else if (userId === appeal.appellant_id) {
    eligibility = { canVote: false, reason: "You can't serve on a jury for your own appeal." };
  } else if (userId === debate.candidate_a_id || userId === debate.candidate_b_id) {
    eligibility = { canVote: false, reason: "Candidates in this debate can't serve on the jury." };
  } else if (!verified) {
    eligibility = {
      canVote: false,
      reason: "Only verified constituents can serve on this jury",
    };
  } else if (ownVerdict !== null) {
    eligibility = { canVote: false, reason: "You already cast a verdict on this appeal." };
  }

  const winnerLabel =
    debate.winner_id && debate.winner_id === debate.candidate_a_id
      ? names.get(debate.candidate_a_id) ?? "Candidate A"
      : debate.winner_id && debate.winner_id === debate.candidate_b_id
        ? names.get(debate.candidate_b_id) ?? "Candidate B"
        : "Tie";

  return {
    appeal,
    debate,
    prompt,
    candidateAName: names.get(debate.candidate_a_id ?? "") ?? "Candidate A",
    candidateBName: names.get(debate.candidate_b_id ?? "") ?? "Candidate B",
    appellantName: appeal.appellant_id ? (names.get(appeal.appellant_id) ?? null) : null,
    rounds: roundPairs((argumentData ?? []) as ArgumentRow[], {
      candidate_a_id: debate.candidate_a_id,
      candidate_b_id: debate.candidate_b_id,
      current_round: debate.current_round ?? 1,
      candidate_a_argument: debate.candidate_a_argument,
      candidate_b_argument: debate.candidate_b_argument,
    }),
    winnerLabel,
    districtOcdId,
    eligibility,
    ownVerdict,
    verdicts: verdicts.length,
    overturnedVotes: verdicts.filter((row) => row.overturned).length,
    quorum: JURY_QUORUM,
  };
}
