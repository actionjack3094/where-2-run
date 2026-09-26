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

  // Candidate profiles live on public.users. candidate_stats projects this
  // column, and only the service role can update that view.
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

  revalidatePath("/matchmaker");
  revalidatePath(`/candidate/${user.id}`);
  redirect("/matchmaker");
}
