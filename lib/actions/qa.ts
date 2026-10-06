"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { platformAdmin } from "@/lib/platform/records";
import { constituentAccess } from "@/lib/platform/tier2";
import { ANSWER_MAX, QUESTION_MAX, cleanTownHallText } from "@/lib/platform/town-hall";

export type TownHallResult = {
  error?: string;
  message?: string;
};

function refreshDebate(debateId: string, profileIds: string[]) {
  revalidatePath("/ballot");
  revalidatePath("/debates");
  for (const id of profileIds) revalidatePath(`/profile/${id}`);
  revalidatePath(`/debates/${debateId}`);
}

export async function submitConstituentQuestion(debateId: string, contentText: string): Promise<TownHallResult> {
  if (!isUuid(debateId)) return { error: "That debate is not on the board." };
  const content = cleanTownHallText(contentText, QUESTION_MAX);
  if (!content) return { error: "A question can be 280 characters at most." };

  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to ask a question." };
  const admin = platformAdmin();
  const access = await constituentAccess(admin, userId);
  if (!access.ok) return { error: access.error };

  const debate = await admin
    .from("arena_debates")
    .select("id, status, candidate_a_id, candidate_b_id")
    .eq("id", debateId)
    .maybeSingle();
  if (debate.error) {
    if (isMissingSchema(debate.error)) return { error: "Apply the town hall migration, then reload." };
    return { error: debate.error.message };
  }
  const row = debate.data as {
    id: string;
    status: string;
    candidate_a_id: string;
    candidate_b_id: string | null;
  } | null;
  if (!row || row.status !== "concluded") return { error: "Town Hall opens after the debate is judged." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("constituent_questions").insert({
    debate_id: debateId,
    voter_id: userId,
    content,
  });
  if (error) {
    if (isMissingSchema(error)) return { error: "Apply the town hall migration, then reload." };
    if (error.code === "23505") return { error: "You already asked a question on this debate." };
    return { error: error.message };
  }

  refreshDebate(debateId, [userId, row.candidate_a_id, row.candidate_b_id ?? ""]);
  return { message: "Question filed." };
}

export async function submitCandidateAnswer(questionId: string, contentText: string): Promise<TownHallResult> {
  if (!isUuid(questionId)) return { error: "That question is not in the Town Hall." };
  const content = cleanTownHallText(contentText, ANSWER_MAX);
  if (!content) return { error: "Write an answer before you send it." };

  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to answer." };
  const admin = platformAdmin();

  const question = await admin
    .from("constituent_questions")
    .select("id, debate_id")
    .eq("id", questionId)
    .maybeSingle();
  if (question.error) {
    if (isMissingSchema(question.error)) return { error: "Apply the town hall migration, then reload." };
    return { error: question.error.message };
  }
  const asked = question.data as { id: string; debate_id: string } | null;
  if (!asked) return { error: "That question is not in the Town Hall." };

  const debate = await admin
    .from("arena_debates")
    .select("id, status, candidate_a_id, candidate_b_id")
    .eq("id", asked.debate_id)
    .maybeSingle();
  if (debate.error) return { error: debate.error.message };
  const row = debate.data as {
    id: string;
    status: string;
    candidate_a_id: string;
    candidate_b_id: string | null;
  } | null;
  if (!row || row.status !== "concluded") return { error: "Town Hall opens after the debate is judged." };
  if (userId !== row.candidate_a_id && userId !== row.candidate_b_id) {
    return { error: "Voters cannot reply to each other. Only the seated candidates can answer." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("candidate_answers").insert({
    question_id: questionId,
    candidate_id: userId,
    content,
  });
  if (error) {
    if (isMissingSchema(error)) return { error: "Apply the town hall migration, then reload." };
    if (error.code === "23505") return { error: "You already answered this question." };
    return { error: error.message };
  }

  refreshDebate(row.id, [userId, row.candidate_a_id, row.candidate_b_id ?? ""]);
  return { message: "Answer filed." };
}
