"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/db/supabase-server";

export async function submitArgument(debateId: string, formData: FormData) {
  const rawArgument = formData.get("argument");
  const argument = typeof rawArgument === "string" ? rawArgument.trim() : "";
  if (!argument) {
    throw new Error("Write an argument before submitting.");
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sign in to submit an argument.");
  }

  const { data: debate, error: debateError } = await supabase
    .from("debates")
    .select("id, candidate_a_id, candidate_b_id")
    .eq("id", debateId)
    .maybeSingle();

  if (debateError) throw new Error(debateError.message);

  const row = debate as {
    id: string;
    candidate_a_id: string | null;
    candidate_b_id: string | null;
  } | null;

  if (!row) {
    throw new Error("Debate not found.");
  }

  const update =
    user.id === row.candidate_a_id
      ? { candidate_a_argument: argument }
      : user.id === row.candidate_b_id
        ? { candidate_b_argument: argument }
        : null;

  if (!update) {
    throw new Error("Only seated candidates can submit an argument.");
  }

  const { data: saved, error: updateError } = await supabase
    .from("debates")
    .update(update)
    .eq("id", debateId)
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!saved) throw new Error("Could not save the argument.");

  revalidatePath("/debates/[debateId]", "page");
}
