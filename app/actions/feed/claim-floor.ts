"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";

function isMissingQuestionLink(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /election_question_id/i.test(message)
  );
}

function isWaitingStatusRejected(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  return error.code === "23514" || /debates_status_check/i.test(error.message ?? "");
}

export async function claimQuestionFloor(
  input: { questionId: string; debateId?: string | null },
  accessToken?: string | null,
) {
  if (!isUuid(input.questionId)) throw new Error("A valid question is required.");
  if (input.debateId && !isUuid(input.debateId)) throw new Error("A valid debate is required.");

  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to take the floor.");

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("target_district_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  const districtId = (profile as { target_district_id?: string | null } | null)?.target_district_id;
  if (!districtId) throw new Error("File a district before taking the floor.");

  const { data: question, error: questionError } = await admin
    .from("election_questions")
    .select("id, prompt, election_id")
    .eq("id", input.questionId)
    .maybeSingle();

  if (questionError) throw new Error(questionError.message);
  const prompt = (question as { prompt?: string; election_id?: string } | null)?.prompt;
  const electionId = (question as { election_id?: string } | null)?.election_id ?? null;
  if (!prompt) throw new Error("That question is no longer in the bank.");

  if (input.debateId) {
    const { data: updated, error } = await admin
      .from("debates")
      .update({
        candidate_b_id: userId,
        status: "active",
      })
      .eq("id", input.debateId)
      .eq("election_question_id", input.questionId)
      .eq("district_id", districtId)
      .eq("status", "waiting")
      .is("candidate_b_id", null)
      .neq("candidate_a_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      if (isMissingQuestionLink(error) || isWaitingStatusRejected(error)) {
        throw new Error("Waiting floors are not on the database yet. Apply the debate question migration.");
      }
      throw new Error(error.message);
    }
    if (!updated) throw new Error("That challenge is no longer open.");

    revalidatePath("/feed");
    revalidatePath(`/debates/${updated.id}`);
    return { debateId: updated.id, role: "candidate_b" as const };
  }

  const { data: openFloor, error: openError } = await admin
    .from("debates")
    .select("id, candidate_a_id")
    .eq("election_question_id", input.questionId)
    .eq("district_id", districtId)
    .eq("status", "waiting")
    .is("candidate_b_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (openError) {
    if (isMissingQuestionLink(openError) || isWaitingStatusRejected(openError)) {
      throw new Error("Waiting floors are not on the database yet. Apply the debate question migration.");
    }
    throw new Error(openError.message);
  }

  const existing = openFloor as { id: string; candidate_a_id: string | null } | null;
  if (existing?.id && existing.candidate_a_id === userId) {
    return { debateId: existing.id, role: "candidate_a" as const };
  }
  if (existing?.id && existing.candidate_a_id) {
    const { data: challenged, error: challengeError } = await admin
      .from("debates")
      .update({ candidate_b_id: userId, status: "active" })
      .eq("id", existing.id)
      .eq("status", "waiting")
      .is("candidate_b_id", null)
      .neq("candidate_a_id", userId)
      .select("id")
      .maybeSingle();

    if (challengeError) throw new Error(challengeError.message);
    if (!challenged) throw new Error("That challenge is no longer open.");
    revalidatePath("/feed");
    revalidatePath(`/debates/${challenged.id}`);
    return { debateId: challenged.id, role: "candidate_b" as const };
  }

  const { data: created, error: insertError } = await admin
    .from("debates")
    .insert({
      topic: prompt,
      district_id: districtId,
      election_id: electionId,
      election_question_id: input.questionId,
      candidate_a_id: userId,
      status: "waiting",
      current_round: 1,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    if (isMissingQuestionLink(insertError) || isWaitingStatusRejected(insertError)) {
      throw new Error("Waiting floors are not on the database yet. Apply the debate question migration.");
    }
    throw new Error(insertError?.message ?? "Could not open a floor for this question.");
  }

  revalidatePath("/feed");
  revalidatePath(`/debates/${created.id}`);
  return { debateId: created.id, role: "candidate_a" as const };
}
