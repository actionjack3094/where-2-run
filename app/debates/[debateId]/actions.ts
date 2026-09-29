"use server";

import { revalidatePath } from "next/cache";
import { TOTAL_ROUNDS } from "@/lib/arena/time";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { argumentFor, isSimUsername, turnFor, type ArgumentRow } from "@/lib/debates/round-state";
import { assertSpectatorCivicFence } from "@/lib/spectator-civic-fence";

const VOTING_WINDOW_MS = 24 * 60 * 60 * 1000;

type DebateTurnRow = {
  id: string;
  status: string;
  current_round: number;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
  candidate_a_argument?: string | null;
  candidate_b_argument?: string | null;
};

function isMissingArgumentColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /candidate_[ab]_argument/i.test(error.message ?? "")
  );
}

/**
 * File the viewer's argument for the current round.
 *
 * - The `arguments` table is the record. One row per (debate, author, round);
 *   filing never touches the opponent's row.
 * - `debates.candidate_x_argument` is only a mirror of the latest text for the
 *   filing side. Nothing is cleared, so both cards keep their text.
 * - When candidate B closes the round the debate leaves the argument stage:
 *   it moves to `voting` after the last round, or immediately when the opponent
 *   is an arena-sim bot (bots do not reply on their own).
 */
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

  // The session above proves who is asking; the admin client does the writes
  // because `arguments` only accepts service-role inserts.
  const admin = createAdminClient();

  const { data: debate, error: debateError } = await admin
    .from("debates")
    .select("*")
    .eq("id", debateId)
    .maybeSingle();

  if (debateError) throw new Error(debateError.message);

  const row = debate as DebateTurnRow | null;
  if (!row) throw new Error("Debate not found.");

  const isCandidateA = user.id === row.candidate_a_id;
  const isCandidateB = user.id === row.candidate_b_id;

  if (!isCandidateA && !isCandidateB) {
    throw new Error("Only seated candidates can submit an argument.");
  }
  if (row.status !== "active" || !row.candidate_a_id || !row.candidate_b_id) {
    throw new Error("Not your turn");
  }

  const round = row.current_round;
  if (!Number.isInteger(round) || round < 1 || round > TOTAL_ROUNDS) {
    throw new Error("Not your turn");
  }

  const { data: history, error: historyError } = await admin
    .from("arguments")
    .select("author_id, round_number, content")
    .eq("debate_id", debateId);

  if (historyError) throw new Error(historyError.message);

  const rows = (history ?? []) as ArgumentRow[];

  // Older debates kept round-1 text only in the mirror columns. Copy it into
  // `arguments` so it survives once the candidate's later rounds are filed.
  for (const legacySide of ["a", "b"] as const) {
    const authorId = legacySide === "a" ? row.candidate_a_id : row.candidate_b_id;
    const text = argumentFor(rows, row, legacySide, round);
    const stored = rows.some((entry) => entry.author_id === authorId && entry.round_number === round);
    if (!authorId || !text || stored) continue;
    const { error: backfillError } = await admin.from("arguments").insert({
      debate_id: debateId,
      author_id: authorId,
      round_number: round,
      content: text,
    });
    if (backfillError) throw new Error(backfillError.message);
    rows.push({ author_id: authorId, round_number: round, content: text });
  }

  const side = isCandidateA ? "a" : "b";
  if (turnFor(rows, row) !== side) {
    throw new Error("Not your turn");
  }

  const { error: insertError } = await admin.from("arguments").insert({
    debate_id: debateId,
    author_id: user.id,
    round_number: round,
    content: argument,
  });
  if (insertError) throw new Error(insertError.message);

  const mirror = isCandidateA
    ? { candidate_a_argument: argument }
    : { candidate_b_argument: argument };

  // Candidate A opening: only the mirror changes; the round stays open for B.
  let progression: { status?: string; expires_at?: string; current_round?: number } = {};

  if (isCandidateB) {
    const { data: users, error: usersError } = await admin
      .from("users")
      .select("id, username")
      .in("id", [row.candidate_a_id, row.candidate_b_id]);
    if (usersError) throw new Error(usersError.message);

    const opponent = (users ?? []).find((entry) => entry.id === row.candidate_a_id);
    const opponentIsBot = isSimUsername(opponent?.username);

    progression =
      opponentIsBot || round >= TOTAL_ROUNDS
        ? {
            status: "voting",
            expires_at: new Date(Date.now() + VOTING_WINDOW_MS).toISOString(),
          }
        : { current_round: round + 1 };
  }

  let { error: updateError } = await admin
    .from("debates")
    .update({ ...mirror, ...progression })
    .eq("id", debateId)
    .eq("status", "active")
    .eq("current_round", round);

  if (isMissingArgumentColumn(updateError)) {
    // Databases without the mirror columns still get the round transition.
    if (Object.keys(progression).length > 0) {
      ({ error: updateError } = await admin
        .from("debates")
        .update(progression)
        .eq("id", debateId)
        .eq("status", "active")
        .eq("current_round", round));
    } else {
      updateError = null;
    }
  }

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/debates/[debateId]", "page");
  revalidatePath(`/debates/${debateId}`);
  revalidatePath("/feed");
}

export async function castVote(debateId: string, candidateId: string) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sign in to cast a vote.");
  }

  await assertSpectatorCivicFence(supabase, user.id, debateId);

  const { error } = await supabase.from("votes").insert({
    debate_id: debateId,
    voter_id: user.id,
    candidate_id: candidateId,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("You already cast a vote in this debate.");
    }
    throw new Error(error.message);
  }

  revalidatePath("/debates/[debateId]", "page");
}
