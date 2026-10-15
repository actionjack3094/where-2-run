"use server";

import { revalidatePath } from "next/cache";
import { ensureArenaProfile } from "@/lib/arena/ensure-profile";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import {
  applyWedge,
  calibrationQuestion,
  confidenceAfterAnswer,
  CONFIDENCE_FLOOR,
  isLikertChoice,
  readCalibrationAnswered,
  type LikertChoice,
} from "@/lib/townhall/calibration";

type CalibrationResult = {
  x: number;
  y: number;
  confidence: number;
  placed: boolean;
  toast: string;
};

function revalidateCalibration() {
  revalidatePath("/townhall");
  revalidatePath("/ballot");
  revalidatePath("/debates");
  revalidatePath("/elections");
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/onboarding/results");
}

function parseInput(input: unknown): { questionId: string; choice: LikertChoice } {
  if (!input || typeof input !== "object") {
    throw new Error("Choose a position before filing this topic.");
  }
  const record = input as { questionId?: unknown; choice?: unknown };
  const questionId = typeof record.questionId === "string" ? record.questionId : "";
  const choice = typeof record.choice === "string" ? record.choice : "";
  if (!calibrationQuestion(questionId) || !isLikertChoice(choice)) {
    throw new Error("Choose a position before filing this topic.");
  }
  return { questionId, choice };
}

type ProfileRow = {
  ideology_x: number | null;
  ideology_y: number | null;
  confidence_score?: number | null;
};

async function loadProfile(userId: string) {
  const admin = createAdminClient();
  let result = await admin
    .from("profiles")
    .select("ideology_x, ideology_y, confidence_score")
    .eq("id", userId)
    .maybeSingle();
  if (result.error && isMissingSchema(result.error)) {
    result = await admin
      .from("profiles")
      .select("ideology_x, ideology_y")
      .eq("id", userId)
      .maybeSingle();
  }
  if (result.error) throw new Error(result.error.message);
  return { admin, row: (result.data as ProfileRow | null) ?? null };
}

export async function calibrateWedge(input: unknown): Promise<CalibrationResult> {
  const user = await getServerUser();
  if (!user) throw new Error("Sign in to calibrate your vector.");

  const { questionId, choice } = parseInput(input);
  const question = calibrationQuestion(questionId);
  if (!question) throw new Error("Choose a position before filing this topic.");

  await ensureArenaProfile();
  const { admin, row } = await loadProfile(user.id);
  const placed = row?.ideology_x != null && row.ideology_y != null;
  const current = {
    x: row?.ideology_x ?? 0,
    y: row?.ideology_y ?? 0,
  };
  const storedConfidence =
    typeof row?.confidence_score === "number" && Number.isFinite(row.confidence_score)
      ? row.confidence_score
      : null;

  const existing = await admin
    .from("user_ideologies")
    .select("vector_data")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing.error && !isMissingSchema(existing.error)) {
    throw new Error(existing.error.message);
  }
  const answered = existing.error ? [] : readCalibrationAnswered(existing.data?.vector_data);
  if (answered.includes(question.id)) {
    return {
      x: current.x,
      y: current.y,
      confidence: storedConfidence ?? CONFIDENCE_FLOOR,
      placed,
      toast: "",
    };
  }

  const nextPoint = applyWedge(current, question, choice);
  const nextConfidence = confidenceAfterAnswer(storedConfidence);
  const profilePayload = {
    ideology_x: nextPoint.x,
    ideology_y: nextPoint.y,
    confidence_score: nextConfidence.score,
  };

  let profile = await admin.from("profiles").update(profilePayload).eq("id", user.id).select("id");
  if (profile.error && isMissingSchema(profile.error)) {
    profile = await admin
      .from("profiles")
      .update({ ideology_x: nextPoint.x, ideology_y: nextPoint.y })
      .eq("id", user.id)
      .select("id");
  }
  if (profile.error) {
    if (!isMissingSchema(profile.error)) throw new Error(profile.error.message);
  } else if ((profile.data ?? []).length === 0) {
    let inserted = await admin.from("profiles").insert({ id: user.id, ...profilePayload });
    if (inserted.error && isMissingSchema(inserted.error)) {
      inserted = await admin.from("profiles").insert({
        id: user.id,
        ideology_x: nextPoint.x,
        ideology_y: nextPoint.y,
      });
    }
    if (inserted.error && !isMissingSchema(inserted.error)) {
      throw new Error(inserted.error.message);
    }
  }

  const prior =
    !existing.error &&
    existing.data?.vector_data &&
    typeof existing.data.vector_data === "object" &&
    !Array.isArray(existing.data.vector_data)
      ? existing.data.vector_data
      : {};

  const ideology = await admin.from("user_ideologies").upsert(
    {
      user_id: user.id,
      vector_data: {
        ...prior,
        calibration: { answered: [...answered, question.id] },
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (ideology.error && !isMissingSchema(ideology.error)) {
    const revert = {
      ideology_x: row?.ideology_x ?? null,
      ideology_y: row?.ideology_y ?? null,
      confidence_score: storedConfidence,
    };
    let rolled = await admin.from("profiles").update(revert).eq("id", user.id);
    if (rolled.error && isMissingSchema(rolled.error)) {
      rolled = await admin
        .from("profiles")
        .update({ ideology_x: revert.ideology_x, ideology_y: revert.ideology_y })
        .eq("id", user.id);
    }
    throw new Error(ideology.error.message);
  }

  revalidateCalibration();
  return {
    x: nextPoint.x,
    y: nextPoint.y,
    confidence: nextConfidence.score,
    placed: true,
    toast: nextConfidence.toast,
  };
}
