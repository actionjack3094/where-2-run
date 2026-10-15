"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureArenaProfile } from "@/lib/arena/ensure-profile";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import { normalizeZip } from "@/lib/electability";
import { buildStanceVector, formatPgStanceVector } from "@/lib/ideology/stance";
import {
  diagnosticCoordinate,
  MATCH_CONFIDENCE_START,
  type DiagnosticAnswer,
} from "@/lib/onboarding/diagnostic";

function refresh() {
  revalidatePath("/");
  revalidatePath("/onboarding");
  revalidatePath("/onboarding/results");
  revalidatePath("/onboarding/location");
  revalidatePath("/ballot");
  revalidatePath("/debates");
  revalidatePath("/townhall");
}

export async function fileDiagnostic(answers: DiagnosticAnswer[]): Promise<{ error?: string }> {
  const user = await getServerUser();
  if (!user) return { error: "Sign in to file your vector." };

  const coordinate = diagnosticCoordinate(answers);
  if (!coordinate) return { error: "Answer all eight questions before continuing." };

  const stanceVector = formatPgStanceVector(
    buildStanceVector({
      economy: coordinate.x,
      environment: coordinate.x,
      immigration: coordinate.x,
      social: coordinate.y,
      foreign_policy: coordinate.y,
    }),
  );

  const admin = createAdminClient();
  await ensureArenaProfile();
  const now = new Date().toISOString();

  const stance = await admin
    .from("users")
    .update({ stance_vector: stanceVector, updated_at: now })
    .eq("id", user.id);
  if (stance.error && !isMissingSchema(stance.error)) return { error: stance.error.message };

  const saved = await writeCoordinate(admin, user.id, coordinate);
  if (saved) return { error: saved };

  refresh();
  return {};
}

export async function fileVotingZip(formData: FormData): Promise<{ error?: string }> {
  const user = await getServerUser();
  if (!user) return { error: "Sign in to save your voting ZIP code." };

  const zip = normalizeZip(String(formData.get("zip") ?? ""));
  if (zip.length !== 5) return { error: "Enter a 5-digit voting ZIP code." };

  const admin = createAdminClient();
  await ensureArenaProfile();
  const now = new Date().toISOString();

  const userRow = await admin
    .from("users")
    .update({ residency_zip: zip, updated_at: now })
    .eq("id", user.id);
  if (userRow.error && !isMissingSchema(userRow.error)) return { error: userRow.error.message };

  const profile = await admin
    .from("profiles")
    .update({ voting_zip_code: zip, onboarding_completed: true })
    .eq("id", user.id)
    .select("id");

  if (profile.error && isMissingSchema(profile.error)) {
    const fallback = await admin
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id);
    if (fallback.error && !isMissingSchema(fallback.error)) return { error: fallback.error.message };
  } else if (profile.error) {
    return { error: profile.error.message };
  }

  refresh();
  redirect("/");
}

async function writeCoordinate(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  coordinate: { x: number; y: number },
) {
  const full = {
    ideology_x: coordinate.x,
    ideology_y: coordinate.y,
    confidence_score: MATCH_CONFIDENCE_START,
  };
  let updated = await admin.from("profiles").update(full).eq("id", userId).select("id");
  if (updated.error && isMissingSchema(updated.error)) {
    updated = await admin
      .from("profiles")
      .update({ ideology_x: coordinate.x, ideology_y: coordinate.y })
      .eq("id", userId)
      .select("id");
  }
  if (updated.error) {
    if (isMissingSchema(updated.error)) return null;
    return updated.error.message;
  }
  if ((updated.data ?? []).length > 0) return null;

  let inserted = await admin.from("profiles").insert({ id: userId, ...full });
  if (inserted.error && isMissingSchema(inserted.error)) {
    inserted = await admin.from("profiles").insert({
      id: userId,
      ideology_x: coordinate.x,
      ideology_y: coordinate.y,
    });
  }
  if (inserted.error && !isMissingSchema(inserted.error)) return inserted.error.message;
  return null;
}
