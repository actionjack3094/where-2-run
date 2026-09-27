"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/db/supabase-server";

const STANCE_DIMENSIONS = 6;

function assertStanceResponses(responses: number[]): number[] {
  if (!Array.isArray(responses) || responses.length !== STANCE_DIMENSIONS) {
    throw new Error("A stance vector needs exactly 6 numeric responses.");
  }

  return responses.map((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Response ${index + 1} must be a number.`);
    }
    const clamped = Math.min(1, Math.max(-1, value));
    return Math.round(clamped * 10000) / 10000;
  });
}

function formatPgVector(values: number[]): string {
  return `[${values.map((value) => value.toFixed(4)).join(",")}]`;
}

export async function saveStanceVector(responses: number[]) {
  const vector = assertStanceResponses(responses);
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sign in to file a stance vector.");
  }

  const { data: existing, error: readError } = await supabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  if (!existing) {
    const username = `runner-${user.id.replace(/-/g, "").slice(0, 8)}`;
    const { error: insertError } = await supabase.from("users").insert({
      id: user.id,
      username,
    });
    if (insertError && insertError.code !== "23505") {
      throw new Error(insertError.message);
    }
  }

  const { error } = await supabase
    .from("users")
    .update({
      stance_vector: formatPgVector(vector),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/", "layout");
  redirect("/matchmaker");
}
