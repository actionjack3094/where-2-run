"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureArenaProfile } from "@/lib/arena/ensure-profile";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import {
  parseTownhallAnswers,
  townhallCoordinate,
  townhallStanceVector,
} from "@/lib/onboarding/townhall";

export async function fileTownhall(input: unknown) {
  const user = await getServerUser();
  if (!user) throw new Error("Sign in to file the Townhall.");

  const answers = parseTownhallAnswers(input);
  const coordinate = townhallCoordinate(answers);
  const stanceVector = townhallStanceVector(answers);
  const admin = createAdminClient();
  await ensureArenaProfile();

  const now = new Date().toISOString();
  const { error: stanceError } = await admin
    .from("users")
    .update({
      stance_vector: stanceVector,
      updated_at: now,
    })
    .eq("id", user.id);
  if (stanceError) throw new Error(stanceError.message);

  const profile = await admin
    .from("profiles")
    .update({
      ideology_x: coordinate.x,
      ideology_y: coordinate.y,
      onboarding_completed: true,
    })
    .eq("id", user.id)
    .select("id");

  if (profile.error) {
    if (!isMissingSchema(profile.error)) throw new Error(profile.error.message);
  } else if ((profile.data ?? []).length === 0) {
    const inserted = await admin.from("profiles").insert({
      id: user.id,
      ideology_x: coordinate.x,
      ideology_y: coordinate.y,
      onboarding_completed: true,
    });
    if (inserted.error && !isMissingSchema(inserted.error)) {
      throw new Error(inserted.error.message);
    }
  }

  const existing = await admin
    .from("user_ideologies")
    .select("vector_data")
    .eq("user_id", user.id)
    .maybeSingle();

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
        townhall: { answers },
      },
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (ideology.error && !isMissingSchema(ideology.error)) {
    throw new Error(ideology.error.message);
  }

  revalidatePath("/townhall");
  revalidatePath("/ballot");
  revalidatePath("/debates");
  revalidatePath("/elections");
  revalidatePath("/dashboard");
  redirect("/ballot");
}
