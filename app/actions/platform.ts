"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { acceptDebateChallenge, createPrimaryDebatePrompt, submitRebuttal } from "@/lib/actions/debates";
import { coordinateFromAnswers } from "@/lib/platform/questions";
import {
  loadArenaById,
  loadHomeOcdIds,
  loadProfile,
  ocdMatches,
  platformAdmin,
  type PlatformAdmin,
} from "@/lib/platform/records";
import type { PublicJudgment } from "@/lib/platform/types";
import type { Primary } from "@/types/database.types";

export type PlatformFormState = {
  error?: string;
  message?: string;
  judgment?: PublicJudgment;
} | null;

function refresh() {
  revalidatePath("/ballot");
  revalidatePath("/debates");
  revalidatePath("/primaries");
}

async function signedIn() {
  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to continue.", userId: null, admin: null, profile: null };
  const admin = platformAdmin();
  const profile = await loadProfile(admin, userId);
  return { error: null, userId, admin, profile };
}

async function primaryForDebate(admin: PlatformAdmin, primaryId: string) {
  const { data, error } = await admin
    .from("primaries")
    .select("id, party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug, created_at")
    .eq("id", primaryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Primary | null) ?? null;
}

export async function completeIdeologyDiagnostic(answers: number[]) {
  const session = await signedIn();
  if (!session.userId || !session.admin) return { error: session.error ?? "Sign in to continue." };
  let coordinate: { x: number; y: number };
  try {
    coordinate = coordinateFromAnswers(answers);
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Answer all 12 questions." };
  }
  const patch = {
    ideology_x: coordinate.x,
    ideology_y: coordinate.y,
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };
  const write = session.profile
    ? session.admin.from("profiles").update(patch).eq("id", session.userId)
    : session.admin.from("profiles").insert({
        id: session.userId,
        candidate_tier: "pundit",
        ...patch,
      });
  const { error } = await write;
  if (error) return { error: error.message };
  refresh();
  return { coordinate };
}

export async function postOpening(
  _prev: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  return createPrimaryDebatePrompt(
    String(formData.get("primaryId") ?? ""),
    String(formData.get("prompt") ?? ""),
    String(formData.get("stance") ?? ""),
    formData.get("sparWithAi") === "on",
  );
}

export async function challengeSeat(
  _prev: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  return acceptDebateChallenge(String(formData.get("debateId") ?? ""));
}

export async function fileRebuttal(
  _prev: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  return submitRebuttal(String(formData.get("debateId") ?? ""), String(formData.get("stance") ?? ""));
}

async function ballotDebate(admin: PlatformAdmin, userId: string, debateId: string) {
  const debate = await loadArenaById(admin, debateId);
  if (!debate?.candidate_b_id) return { error: "That match is not on a ballot yet.", debate: null, primary: null };
  const primary = await primaryForDebate(admin, debate.primary_id);
  if (!primary) return { error: "That primary is not on the board.", debate: null, primary: null };
  const home = await loadHomeOcdIds(admin, userId);
  if (!ocdMatches(home, primary.ocd_id)) {
    return { error: "My Ballot only includes your verified address.", debate: null, primary: null };
  }
  return { error: null, debate, primary };
}

export async function likeMatch(
  _prev: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  try {
    const session = await signedIn();
    if (!session.userId || !session.admin) return { error: session.error ?? "Sign in to continue." };
    const supportedId = String(formData.get("supportedId") ?? "");
    const loaded = await ballotDebate(session.admin, session.userId, String(formData.get("debateId") ?? ""));
    if (!loaded.debate || loaded.error) return { error: loaded.error ?? "That match is not on your ballot." };
    if (supportedId !== loaded.debate.candidate_a_id && supportedId !== loaded.debate.candidate_b_id) {
      return { error: "Like one of the two contenders." };
    }
    const existing = await session.admin
      .from("debate_likes")
      .select("id")
      .eq("debate_id", loaded.debate.id)
      .eq("user_id", session.userId)
      .maybeSingle();
    if (existing.error) return { error: existing.error.message };
    const write = existing.data
      ? session.admin
          .from("debate_likes")
          .update({ supported_id: supportedId })
          .eq("id", (existing.data as { id: string }).id)
      : session.admin.from("debate_likes").insert({
          debate_id: loaded.debate.id,
          user_id: session.userId,
          supported_id: supportedId,
        });
    const { error } = await write;
    if (error) return { error: error.message };
    refresh();
    return { message: "Like recorded." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not record that like." };
  }
}

export async function commentOnMatch(
  _prev: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  try {
    const session = await signedIn();
    if (!session.userId || !session.admin) return { error: session.error ?? "Sign in to continue." };
    const body = String(formData.get("body") ?? "").trim();
    if (body.length < 1 || body.length > 400) return { error: "Keep the comment under 400 characters." };
    const loaded = await ballotDebate(session.admin, session.userId, String(formData.get("debateId") ?? ""));
    if (!loaded.debate || loaded.error) return { error: loaded.error ?? "That match is not on your ballot." };
    const { error } = await session.admin.from("debate_comments").insert({
      debate_id: loaded.debate.id,
      author_id: session.userId,
      body,
    });
    if (error) return { error: error.message };
    refresh();
    return { message: "Comment posted." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not post that comment." };
  }
}
