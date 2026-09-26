"use server";

import { revalidatePath } from "next/cache";
import { TOTAL_ROUNDS } from "@/lib/arena/time";
import { createAdminClient } from "@/lib/db/supabase-admin";
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
      "id, status, current_round, candidate_a_id, candidate_b_id, candidate_a_argument, candidate_b_argument",
    )
    .eq("id", debateId)
    .maybeSingle();

  if (debateError) throw new Error(debateError.message);

  const row = debate as {
    id: string;
    status: string;
    current_round: number;
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

  if (row.status !== "active") {
    throw new Error("Not your turn");
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

  const candidateAArgument = isCandidateA ? argument : row.candidate_a_argument;
  const candidateBArgument = isCandidateB ? argument : row.candidate_b_argument;
  const round = row.current_round;

  if (isCandidateB) {
    if (
      !row.candidate_a_id ||
      !row.candidate_b_id ||
      !candidateAArgument ||
      !candidateBArgument ||
      !Number.isInteger(round) ||
      round < 1 ||
      round > TOTAL_ROUNDS
    ) {
      throw new Error("Not your turn");
    }

    const admin = createAdminClient();
    const { data: existingHistory, error: historyReadError } = await admin
      .from("arguments")
      .select("author_id")
      .eq("debate_id", debateId)
      .eq("round_number", round);

    if (historyReadError) throw new Error(historyReadError.message);

    const alreadyFiled = new Set((existingHistory ?? []).map((entry) => entry.author_id));
    const historyRows = [
      {
        debate_id: debateId,
        author_id: row.candidate_a_id,
        round_number: round,
        content: candidateAArgument,
      },
      {
        debate_id: debateId,
        author_id: row.candidate_b_id,
        round_number: round,
        content: candidateBArgument,
      },
    ];

    for (const entry of historyRows) {
      const write = alreadyFiled.has(entry.author_id)
        ? admin
            .from("arguments")
            .update({ content: entry.content })
            .eq("debate_id", debateId)
            .eq("author_id", entry.author_id)
            .eq("round_number", round)
        : admin.from("arguments").insert(entry);
      const { error: historyError } = await write;
      if (historyError) throw new Error(historyError.message);
    }

    const progression =
      round < TOTAL_ROUNDS
        ? {
            candidate_a_argument: null,
            candidate_b_argument: null,
            current_round: round + 1,
          }
        : {
            candidate_a_argument: null,
            candidate_b_argument: null,
            status: "voting",
          };

    const { data: saved, error: updateError } = await supabase
      .from("debates")
      .update(progression)
      .eq("id", debateId)
      .eq("status", "active")
      .eq("current_round", round)
      .not("candidate_a_argument", "is", null)
      .is("candidate_b_argument", null)
      .select("id")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!saved) throw new Error("Not your turn");

    revalidatePath("/debates/[debateId]", "page");
    return;
  }

  const { data: saved, error: updateError } = await supabase
    .from("debates")
    .update({ candidate_a_argument: candidateAArgument })
    .eq("id", debateId)
    .eq("status", "active")
    .is("candidate_a_argument", null)
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!saved) throw new Error("Not your turn");

  revalidatePath("/debates/[debateId]", "page");
}
