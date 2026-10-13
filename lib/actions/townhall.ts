"use server";

import { revalidatePath } from "next/cache";
import { ensureArenaProfile } from "@/lib/arena/ensure-profile";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import {
  coordinateWithDeck,
  parseDeckStances,
  parseTownhallAnswers,
  readDeckStances,
  readTownhallAnswers,
  stanceVectorWithDeck,
  TOWNHALL_DECK,
  type DeckCardId,
  type DeckStance,
  type TownhallAnswer,
} from "@/lib/onboarding/townhall";

function revalidateTownhallSurfaces() {
  revalidatePath("/townhall");
  revalidatePath("/ballot");
  revalidatePath("/debates");
  revalidatePath("/elections");
  revalidatePath("/elections/matched");
  revalidatePath("/dashboard");
}

async function writeTownhall(userId: string, answers: TownhallAnswer[], deck: DeckStance[]) {
  const coordinate = coordinateWithDeck(answers, deck);
  const stanceVector = stanceVectorWithDeck(answers, deck);
  const admin = createAdminClient();
  await ensureArenaProfile();

  const now = new Date().toISOString();
  const { error: stanceError } = await admin
    .from("users")
    .update({
      stance_vector: stanceVector,
      updated_at: now,
    })
    .eq("id", userId);
  if (stanceError) throw new Error(stanceError.message);

  const profile = await admin
    .from("profiles")
    .update({
      ideology_x: coordinate.x,
      ideology_y: coordinate.y,
      onboarding_completed: true,
    })
    .eq("id", userId)
    .select("id");

  if (profile.error) {
    if (!isMissingSchema(profile.error)) throw new Error(profile.error.message);
  } else if ((profile.data ?? []).length === 0) {
    const inserted = await admin.from("profiles").insert({
      id: userId,
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
    .eq("user_id", userId)
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
      user_id: userId,
      vector_data: {
        ...prior,
        townhall: { answers },
        deck: { answers: deck },
      },
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (ideology.error && !isMissingSchema(ideology.error)) {
    throw new Error(ideology.error.message);
  }

  revalidateTownhallSurfaces();
  return coordinate;
}

export async function fileTownhall(input: unknown) {
  const user = await getServerUser();
  if (!user) throw new Error("Sign in to file the Townhall.");

  const answers = parseTownhallAnswers(input);
  const admin = createAdminClient();
  const existing = await admin
    .from("user_ideologies")
    .select("vector_data")
    .eq("user_id", user.id)
    .maybeSingle();
  const deck = existing.error ? [] : readDeckStances(existing.data?.vector_data);

  await writeTownhall(user.id, answers, deck);
}

function isDeckCardId(value: string): value is DeckCardId {
  return TOWNHALL_DECK.some((card) => card.id === value);
}

/**
 * Record a Support or Oppose on one deck card.
 * A skip is not a stance: it returns without writing, so the vector stays put.
 */
export async function recordTownhallCard(input: unknown) {
  const user = await getServerUser();
  if (!user) throw new Error("Sign in to answer a Townhall card.");

  if (!input || typeof input !== "object") {
    throw new Error("Choose support or oppose before filing this card.");
  }
  const record = input as { id?: unknown; score?: unknown; skip?: unknown };
  if (record.skip === true) return;

  const id = typeof record.id === "string" ? record.id : "";
  const score = typeof record.score === "number" ? record.score : Number(record.score);
  if (!isDeckCardId(id) || (score !== -1 && score !== 1)) {
    throw new Error("Choose support or oppose before filing this card.");
  }

  const card = TOWNHALL_DECK.find((item) => item.id === id);
  if (!card) throw new Error("Choose support or oppose before filing this card.");

  const admin = createAdminClient();
  const existing = await admin
    .from("user_ideologies")
    .select("vector_data")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing.error && !isMissingSchema(existing.error)) {
    throw new Error(existing.error.message);
  }

  const answers = readTownhallAnswers(existing.data?.vector_data);
  if (!answers) throw new Error("File the four baseline questions before the policy deck.");

  const next = parseDeckStances([
    ...readDeckStances(existing.data?.vector_data).filter((stance) => stance.id !== card.id),
    { id: card.id, axis: card.axis, score },
  ]);

  await writeTownhall(user.id, answers, next);
}
