"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatOcdDivision, isMissingCivicColumn, normalizeOcdId } from "@/lib/civic-fencing";
import { lookupCongressionalOcdId } from "@/lib/civic/zip-district";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import { normalizeZip } from "@/lib/electability";
import { buildUserVector } from "@/lib/ideology/questions";
import { SIX_AXIS_IDS } from "@/lib/ideology/six-axis";
import { clamp01, formatPgIdeologyVector } from "@/lib/ideology/vector";

type AdminClient = ReturnType<typeof createAdminClient>;

function asOcdIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

async function ensurePublicUser(admin: AdminClient, userId: string) {
  const { data, error } = await admin.from("users").select("id, username").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as { id: string; username: string };

  const username = `runner-${userId.replace(/-/g, "").slice(0, 8)}`;
  const { error: insertError } = await admin.from("users").insert({ id: userId, username });
  if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
  return { id: userId, username };
}

function expandThreeToSix(scores: number[]) {
  const climate = clamp01(scores[0] ?? 0.5);
  const healthcare = clamp01(scores[1] ?? 0.5);
  const immigration = clamp01(scores[2] ?? 0.5);
  return [climate, healthcare, immigration, climate, healthcare, immigration] as const;
}

function formatSixStance(six: readonly number[]) {
  const signed = six.map((value) => Math.round((clamp01(value) * 2 - 1) * 10000) / 10000);
  return `[${signed.map((value) => value.toFixed(4)).join(",")}]`;
}

export type Tier1Match = {
  zip: string;
  ocdId: string;
  label: string;
};

export async function saveTier1Zip(zip: string): Promise<Tier1Match> {
  const digits = normalizeZip(zip);
  if (digits.length !== 5) {
    throw new Error("Enter a 5-digit residential ZIP code.");
  }

  const user = await getServerUser();
  if (!user) throw new Error("Sign in to map your district.");

  const ocdId = await lookupCongressionalOcdId(digits);
  if (!ocdId) {
    throw new Error("We couldn't match that ZIP to a congressional district.");
  }

  const admin = createAdminClient();
  await ensurePublicUser(admin, user.id);

  const { data: district } = await admin
    .from("districts")
    .select("id, name, ocd_id")
    .eq("ocd_id", ocdId)
    .maybeSingle();

  const { data: existing } = await admin
    .from("users")
    .select("home_ocd_ids, ocd_identifiers")
    .eq("id", user.id)
    .maybeSingle();

  const home = [...new Set([ocdId, ...asOcdIds(existing?.home_ocd_ids).map(normalizeOcdId).filter(Boolean)])];
  const identifiers = [
    ...new Set([ocdId, ...asOcdIds(existing?.ocd_identifiers).map(normalizeOcdId).filter(Boolean)]),
  ];

  const { error } = await admin
    .from("users")
    .update({
      home_ocd_ids: home,
      ocd_identifiers: identifiers,
      residency_zip: digits,
      ...(district?.id ? { target_district_id: district.id } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) {
    if (isMissingCivicColumn(error)) {
      throw new Error("home_ocd_ids is not on profiles yet. Apply the ideological sorting migration.");
    }
    throw new Error(error.message);
  }

  revalidatePath("/onboarding");
  revalidatePath("/feed");
  revalidatePath("/matchmaker");

  return {
    zip: digits,
    ocdId,
    label: district?.name?.trim() || formatOcdDivision(ocdId) || "your congressional district",
  };
}

export async function saveBaselineCalibration(answers: Record<string, number>) {
  const scores = SIX_AXIS_IDS.slice(0, 3).map((axis) => answers[axis]);
  if (scores.some((value) => value == null || !Number.isFinite(value))) {
    throw new Error("Answer all three questions to seed your stance vector.");
  }

  const user = await getServerUser();
  if (!user) throw new Error("Sign in to file a stance vector.");

  const six = expandThreeToSix(scores);
  const ideology = formatPgIdeologyVector(buildUserVector([...six]));

  const admin = createAdminClient();
  await ensurePublicUser(admin, user.id);

  const { error } = await admin
    .from("users")
    .update({
      stance_vector: formatSixStance(six),
      ideology_vector: ideology,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  const now = new Date().toISOString();
  const candidateUpdate = await admin
    .from("candidates")
    .update({
      ideology_vector: ideology,
      onboarding_completed: true,
      updated_at: now,
    })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (
    candidateUpdate.error &&
    !isMissingRelation(candidateUpdate.error) &&
    candidateUpdate.error.code !== "42703"
  ) {
    console.warn("Could not mark candidate onboarding complete.", candidateUpdate.error.message);
  }

  revalidatePath("/onboarding");
  revalidatePath("/feed");
  revalidatePath("/matchmaker");
  revalidatePath("/profile");
  redirect("/matchmaker");
}
