"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { fileRebuttal, rebuttalFor, resolveClashWindow } from "@/lib/debates/clash-room";
import { viewerIsInDistrict } from "@/lib/debates/load-clash-room";
import { cleanRoundText } from "@/lib/debates/structure";
import { platformAdmin } from "@/lib/platform/records";

export type ClashActionResult = {
  error?: string;
  message?: string;
  upvoted?: boolean;
  count?: number;
};

function refresh(debateId: string) {
  revalidatePath("/debates");
  revalidatePath(`/debates/${debateId}`);
}

type WindowRow = {
  id: string;
  primary_id: string;
  candidate_a_id: string;
  candidate_b_id: string | null;
  clash_stage?: string | null;
  rebuttal_expires_at?: string | null;
  seat_locked_until?: string | null;
  round_transcript?: unknown;
  status?: string | null;
};

async function loadWindow(debateId: string) {
  const admin = platformAdmin();
  const full = await admin
    .from("arena_debates")
    .select(
      "id, primary_id, candidate_a_id, candidate_b_id, clash_stage, rebuttal_expires_at, seat_locked_until, round_transcript, status",
    )
    .eq("id", debateId)
    .maybeSingle();
  if (full.error && isMissingSchema(full.error)) {
    const base = await admin
      .from("arena_debates")
      .select("id, primary_id, candidate_a_id, candidate_b_id, seat_locked_until, status")
      .eq("id", debateId)
      .maybeSingle();
    if (base.error) return { error: base.error.message, row: null, admin };
    return { error: null, row: (base.data as WindowRow | null) ?? null, admin };
  }
  if (full.error) return { error: full.error.message, row: null, admin };
  return { error: null, row: (full.data as WindowRow | null) ?? null, admin };
}

function windowFor(row: WindowRow) {
  const stage =
    row.clash_stage ??
    (row.status === "concluded" || row.status === "cancelled" ? "closed" : row.status === "active" ? "rebuttal" : "opening");
  return resolveClashWindow({
    clashStage: stage,
    rebuttalExpiresAt: row.rebuttal_expires_at ?? row.seat_locked_until ?? null,
  });
}

export async function submitClashRebuttal(debateId: string, stanceText: string): Promise<ClashActionResult> {
  if (!isUuid(debateId)) return { error: "That debate is not on the board." };
  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to file a rebuttal." };

  const loaded = await loadWindow(debateId);
  if (loaded.error) return { error: loaded.error };
  const debate = loaded.row;
  if (!debate) return { error: "That debate is not on the board." };
  if (windowFor(debate) !== "rebuttal") return { error: "The rebuttal window is closed." };
  if (userId !== debate.candidate_a_id && userId !== debate.candidate_b_id) {
    return { error: "Only the two candidates can file a rebuttal." };
  }
  if (!debate.candidate_b_id) return { error: "A challenger has to lock the seat before rebuttals open." };
  if (rebuttalFor(debate.round_transcript, userId)) return { error: "You already filed a rebuttal." };

  const cleaned = cleanRoundText(stanceText, "Rebuttal");
  if ("error" in cleaned) return { error: cleaned.error };

  const fresh = await loaded.admin
    .from("arena_debates")
    .select("round_transcript")
    .eq("id", debate.id)
    .maybeSingle();
  if (fresh.error) {
    if (isMissingSchema(fresh.error)) return { error: "Apply the debate rounds migration, then reload." };
    return { error: fresh.error.message };
  }
  const prior = (fresh.data as { round_transcript?: unknown } | null)?.round_transcript;
  if (rebuttalFor(prior, userId)) return { error: "You already filed a rebuttal." };

  const { error } = await loaded.admin
    .from("arena_debates")
    .update({
      round_transcript: fileRebuttal(prior, { round: 2, author_id: userId, content: cleaned.text }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", debate.id);
  if (error) {
    if (isMissingSchema(error)) return { error: "Apply the debate rounds migration, then reload." };
    return { error: error.message };
  }

  refresh(debate.id);
  return { message: "Rebuttal filed." };
}

export async function toggleQuestionUpvote(questionId: string): Promise<ClashActionResult> {
  if (!isUuid(questionId)) return { error: "That question is not on this debate." };
  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to upvote." };

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
  if (!asked) return { error: "That question is not on this debate." };

  const loaded = await loadWindow(asked.debate_id);
  if (loaded.error) return { error: loaded.error };
  if (!loaded.row) return { error: "That debate is not on the board." };
  if (windowFor(loaded.row) === "locked") return { error: "This debate is concluded. Votes are final." };

  const allowed = await viewerIsInDistrict(userId, loaded.row.primary_id ? await primaryOcd(admin, loaded.row.primary_id) : null);
  if (!allowed) return { error: "Only a verified voter in this district can upvote." };

  const existing = await admin
    .from("constituent_question_votes")
    .select("question_id")
    .eq("question_id", asked.id)
    .eq("voter_id", userId)
    .maybeSingle();
  if (existing.error) {
    if (isMissingSchema(existing.error)) return { error: "Apply the question vote migration, then reload." };
    return { error: existing.error.message };
  }

  if (existing.data) {
    const removed = await admin
      .from("constituent_question_votes")
      .delete()
      .eq("question_id", asked.id)
      .eq("voter_id", userId);
    if (removed.error) return { error: removed.error.message };
  } else {
    const inserted = await admin.from("constituent_question_votes").insert({
      question_id: asked.id,
      voter_id: userId,
    });
    if (inserted.error) {
      if (isMissingSchema(inserted.error)) return { error: "Apply the question vote migration, then reload." };
      return { error: inserted.error.message };
    }
  }

  const tally = await admin
    .from("constituent_question_votes")
    .select("question_id", { count: "exact", head: true })
    .eq("question_id", asked.id);
  refresh(asked.debate_id);
  return {
    message: existing.data ? "Upvote removed." : "Upvote recorded.",
    upvoted: !existing.data,
    count: tally.count ?? undefined,
  };
}

async function primaryOcd(admin: ReturnType<typeof platformAdmin>, primaryId: string) {
  const result = await admin.from("primaries").select("ocd_id").eq("id", primaryId).maybeSingle();
  if (result.error || !result.data) return null;
  return (result.data as { ocd_id?: string | null }).ocd_id ?? null;
}
