"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { resolveClashWindow } from "@/lib/debates/clash-room";
import { viewerIsInDistrict } from "@/lib/debates/load-clash-room";
import { platformAdmin } from "@/lib/platform/records";
import { QUESTION_MAX, cleanTownHallText } from "@/lib/platform/town-hall";

export type QaResult = {
  error?: string;
  message?: string;
};

function refreshDebate(debateId: string) {
  revalidatePath("/ballot");
  revalidatePath("/debates");
  revalidatePath(`/debates/${debateId}`);
}

function cleanAnswer(value: string) {
  const text = value.trim();
  if (text.length < 1) return null;
  return text;
}

function clashClosed(row: {
  clash_stage?: string | null;
  rebuttal_expires_at?: string | null;
  seat_locked_until?: string | null;
  status?: string | null;
}) {
  const stage =
    row.clash_stage ??
    (row.status === "concluded" || row.status === "cancelled" ? "closed" : row.status === "active" ? "rebuttal" : "opening");
  return (
    resolveClashWindow({
      clashStage: stage,
      rebuttalExpiresAt: row.rebuttal_expires_at ?? row.seat_locked_until ?? null,
    }) === "locked"
  );
}

function denied(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "42501" || /row-level security/i.test(error.message ?? "")) return fallback;
  return error.message ?? fallback;
}

export async function submitConstituentQuestion(debateId: string, contentText: string): Promise<QaResult> {
  if (!isUuid(debateId)) return { error: "That debate is not on the board." };
  const content = cleanTownHallText(contentText, QUESTION_MAX);
  if (!content) return { error: "A question can be 280 characters at most." };

  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to ask a question." };

  const admin = platformAdmin();
  const profile = await admin.from("profiles").select("is_verified, tier2_status").eq("id", userId).maybeSingle();
  if (profile.error) {
    if (isMissingSchema(profile.error)) return { error: "Apply the Q&A queue migration, then reload." };
    return { error: profile.error.message };
  }
  const identity = profile.data as { is_verified?: boolean; tier2_status?: string | null } | null;
  const verified = identity?.is_verified === true || identity?.tier2_status === "verified";
  if (!verified) return { error: "Verify your identity before asking a question." };

  const debate = await admin
    .from("arena_debates")
    .select("id, primary_id, candidate_a_id, candidate_b_id, clash_stage, rebuttal_expires_at, seat_locked_until, status")
    .eq("id", debateId)
    .maybeSingle();
  if (debate.error) {
    if (isMissingSchema(debate.error)) return { error: "Apply the Q&A queue migration, then reload." };
    return { error: debate.error.message };
  }
  const row = debate.data as {
    id: string;
    primary_id?: string;
    candidate_a_id?: string;
    candidate_b_id?: string | null;
    clash_stage?: string | null;
    rebuttal_expires_at?: string | null;
    seat_locked_until?: string | null;
    status?: string | null;
  } | null;
  if (!row) return { error: "That debate is not on the board." };
  if (clashClosed(row)) return { error: "This debate is concluded. New questions are closed." };
  if (userId === row.candidate_a_id || userId === row.candidate_b_id) {
    return { error: "Candidates reply to questions. They do not file them." };
  }
  const primary = row.primary_id
    ? await admin.from("primaries").select("ocd_id").eq("id", row.primary_id).maybeSingle()
    : { data: null, error: null };
  const ocdId = (primary.data as { ocd_id?: string | null } | null)?.ocd_id ?? null;
  if (!(await viewerIsInDistrict(userId, ocdId))) {
    return { error: "Only a verified voter in this district can ask a question." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("constituent_questions").insert({
    debate_id: debateId,
    voter_id: userId,
    content,
  });
  if (error) {
    if (isMissingSchema(error)) return { error: "Apply the Q&A queue migration, then reload." };
    if (error.code === "23505") return { error: "You already asked a question on this debate." };
    return { error: denied(error, "Only a verified voter can ask a question.") };
  }

  refreshDebate(debateId);
  return { message: "Question filed." };
}

export async function submitCandidateAnswer(questionId: string, contentText: string): Promise<QaResult> {
  if (!isUuid(questionId)) return { error: "That question is not in the queue." };
  const content = cleanAnswer(contentText);
  if (!content) return { error: "Write a reply before you send it." };

  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to reply." };

  const admin = platformAdmin();
  const question = await admin
    .from("constituent_questions")
    .select("id, debate_id")
    .eq("id", questionId)
    .maybeSingle();
  if (question.error) {
    if (isMissingSchema(question.error)) return { error: "Apply the Q&A queue migration, then reload." };
    return { error: question.error.message };
  }
  const asked = question.data as { id: string; debate_id: string } | null;
  if (!asked) return { error: "That question is not in the queue." };

  const debate = await admin
    .from("arena_debates")
    .select("id, candidate_a_id, candidate_b_id, clash_stage, rebuttal_expires_at, seat_locked_until, status")
    .eq("id", asked.debate_id)
    .maybeSingle();
  if (debate.error) return { error: debate.error.message };
  const row = debate.data as {
    id: string;
    candidate_a_id: string;
    candidate_b_id: string | null;
    clash_stage?: string | null;
    rebuttal_expires_at?: string | null;
    seat_locked_until?: string | null;
    status?: string | null;
  } | null;
  if (!row) return { error: "That debate is not on the board." };
  if (clashClosed(row)) return { error: "This debate is concluded. Replies are closed." };
  if (userId !== row.candidate_a_id && userId !== row.candidate_b_id) {
    return { error: "Voters cannot reply. Only the two candidates on this debate can answer." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("candidate_answers").insert({
    question_id: questionId,
    candidate_id: userId,
    content,
  });
  if (error) {
    if (isMissingSchema(error)) return { error: "Apply the Q&A queue migration, then reload." };
    if (error.code === "23505") return { error: "You already answered this question." };
    return { error: denied(error, "Only the two candidates on this debate can answer.") };
  }

  refreshDebate(row.id);
  return { message: "Reply filed." };
}
