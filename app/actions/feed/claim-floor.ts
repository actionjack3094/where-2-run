"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { sendChallengeEmail } from "@/lib/actions/emails";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { createAdminClient } from "@/lib/db/supabase-admin";

/** An open floor is waiting on a challenger. */
const OPEN_FLOOR_STATUSES = ["waiting", "matching"] as const;

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

async function notifyChallengedCandidate(
  admin: ReturnType<typeof createAdminClient>,
  challengerId: string,
  targetUserId: string | null,
  debateId: string,
  accessToken?: string | null,
) {
  if (!targetUserId) return;

  const { data, error } = await admin
    .from("users")
    .select("username")
    .eq("id", challengerId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  await sendChallengeEmail(
    targetUserId,
    data?.username?.trim() || "A candidate",
    debateId,
    accessToken,
  );
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
    .select("target_district_id, home_ocd_ids, matched_ocd_ids")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  const viewer = profile as {
    target_district_id?: string | null;
    home_ocd_ids?: string[] | null;
    matched_ocd_ids?: string[] | null;
  } | null;

  const { data: question, error: questionError } = await admin
    .from("election_questions")
    .select("id, prompt, election_id")
    .eq("id", input.questionId)
    .maybeSingle();

  if (questionError) throw new Error(questionError.message);
  const prompt = (question as { prompt?: string; election_id?: string } | null)?.prompt;
  const electionId = (question as { election_id?: string } | null)?.election_id ?? null;
  if (!prompt) throw new Error("That question is no longer in the bank.");

  // The race decides the district. A runner may take the floor in their filed
  // district, or in any race on their physical or ideological ballot.
  let electionDistrictId: string | null = null;
  let electionOcdId: string | null = null;
  if (electionId) {
    const { data: election, error: electionError } = await admin
      .from("elections")
      .select("district_id, ocd_id")
      .eq("id", electionId)
      .maybeSingle();
    if (electionError) throw new Error(electionError.message);
    const row = election as { district_id?: string | null; ocd_id?: string | null } | null;
    electionDistrictId = row?.district_id ?? null;
    electionOcdId = row?.ocd_id ?? null;
  }

  const ballot = new Set(
    [...(viewer?.home_ocd_ids ?? []), ...(viewer?.matched_ocd_ids ?? [])].map((id) =>
      normalizeOcdId(id),
    ),
  );
  const onBallot = Boolean(electionOcdId && ballot.has(normalizeOcdId(electionOcdId)));
  const inFiledDistrict = Boolean(
    viewer?.target_district_id && electionDistrictId === viewer.target_district_id,
  );

  const districtId = onBallot
    ? (electionDistrictId ?? viewer?.target_district_id ?? null)
    : inFiledDistrict
      ? electionDistrictId
      : (viewer?.target_district_id ?? null);
  if (!districtId) throw new Error("File a district before taking the floor.");
  if (electionId && !onBallot && !inFiledDistrict && electionDistrictId) {
    throw new Error("That race is not on your ballot.");
  }

  if (input.debateId) {
    const { data: updated, error } = await admin
      .from("debates")
      .update({
        candidate_b_id: userId,
        status: "active",
      })
      .eq("id", input.debateId)
      .eq("election_question_id", input.questionId)
      .in("status", [...OPEN_FLOOR_STATUSES])
      .not("candidate_a_id", "is", null)
      .is("candidate_b_id", null)
      .neq("candidate_a_id", userId)
      .select("id, candidate_a_id")
      .maybeSingle();

    if (error) {
      if (isMissingQuestionLink(error) || isWaitingStatusRejected(error)) {
        throw new Error("Waiting floors are not on the database yet. Apply the debate question migration.");
      }
      throw new Error(error.message);
    }
    if (!updated) throw new Error("That challenge is no longer open.");

    const seated = updated as { id: string; candidate_a_id: string | null };
    await notifyChallengedCandidate(
      admin,
      userId,
      seated.candidate_a_id,
      seated.id,
      accessToken,
    );

    revalidatePath("/feed");
    revalidatePath(`/debates/${updated.id}`);
    return { debateId: updated.id, role: "candidate_b" as const };
  }

  const { data: openFloor, error: openError } = await admin
    .from("debates")
    .select("id, candidate_a_id")
    .eq("election_question_id", input.questionId)
    .in("status", [...OPEN_FLOOR_STATUSES])
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
  if (existing?.id && !existing.candidate_a_id) {
    // A seeded floor with an empty first seat. Sit in it rather than open a twin.
    const { data: seated, error: seatError } = await admin
      .from("debates")
      .update({ candidate_a_id: userId, status: "waiting" })
      .eq("id", existing.id)
      .is("candidate_a_id", null)
      .is("candidate_b_id", null)
      .select("id")
      .maybeSingle();

    if (seatError) throw new Error(seatError.message);
    if (seated) {
      revalidatePath("/feed");
      revalidatePath(`/debates/${seated.id}`);
      return { debateId: seated.id, role: "candidate_a" as const };
    }
  }
  if (existing?.id && existing.candidate_a_id) {
    const { data: challenged, error: challengeError } = await admin
      .from("debates")
      .update({ candidate_b_id: userId, status: "active" })
      .eq("id", existing.id)
      .in("status", [...OPEN_FLOOR_STATUSES])
      .is("candidate_b_id", null)
      .neq("candidate_a_id", userId)
      .select("id, candidate_a_id")
      .maybeSingle();

    if (challengeError) throw new Error(challengeError.message);
    if (!challenged) throw new Error("That challenge is no longer open.");

    const seated = challenged as { id: string; candidate_a_id: string | null };
    await notifyChallengedCandidate(
      admin,
      userId,
      seated.candidate_a_id,
      seated.id,
      accessToken,
    );

    revalidatePath("/feed");
    revalidatePath(`/debates/${challenged.id}`);
    return { debateId: challenged.id, role: "candidate_b" as const };
  }

  try {
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
        return {
          error: "Waiting floors are not on the database yet. Apply the debate question migration.",
        };
      }
      return { error: insertError?.message ?? "Could not open a floor for this question." };
    }

    revalidatePath("/feed");
    revalidatePath(`/debates/${created.id}`);
    return { debateId: created.id, role: "candidate_a" as const };
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Could not open a floor for this question.";
    return { error: message };
  }
}
