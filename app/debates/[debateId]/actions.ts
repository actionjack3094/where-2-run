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
    .select(
      "id, candidate_a_id, candidate_b_id, candidate_a_argument, candidate_b_argument",
    )
    .eq("id", debateId)
    .maybeSingle();

  if (debateError) throw new Error(debateError.message);

  const row = debate as {
    id: string;
    candidate_a_id: string | null;
    candidate_b_id: string | null;
    candidate_a_argument: string | null;
    candidate_b_argument: string | null;
  } | null;

  if (!row) {
    throw new Error("Debate not found.");
  }

  const isCandidateA = user.id === row.candidate_a_id;
  const isCandidateB = user.id === row.candidate_b_id;

  if (!isCandidateA && !isCandidateB) {
    throw new Error("Only seated candidates can submit an argument.");
  }

  if (isCandidateA && row.candidate_a_argument !== null) {
    throw new Error("Not your turn");
  }

  if (
    isCandidateB &&
    (row.candidate_a_argument === null || row.candidate_b_argument !== null)
  ) {
    throw new Error("Not your turn");
  }

  const { data: saved, error: updateError } = isCandidateA
    ? await supabase
        .from("debates")
        .update({ candidate_a_argument: argument })
        .eq("id", debateId)
        .is("candidate_a_argument", null)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("debates")
        .update({ candidate_b_argument: argument })
        .eq("id", debateId)
        .not("candidate_a_argument", "is", null)
        .is("candidate_b_argument", null)
        .select("id")
        .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!saved) throw new Error("Not your turn");

  revalidatePath("/debates/[debateId]", "page");
}
