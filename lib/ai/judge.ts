import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";

const verdictSchema = z.object({
  winner_id: z
    .string()
    .describe("One of the two candidate user ids, or the exact string tie."),
  judge_reasoning: z
    .string()
    .min(1)
    .describe("One paragraph naming the deciding rubric criterion."),
});

export type DebateVerdict = {
  winner_id: string | "tie";
  judge_reasoning: string;
};

const SYSTEM_PROMPT = `You are the official adjudicator for a competitive civic debate.
Grade only the transcript. Decide the winner on these three criteria, in this order:
1. Logical consistency: claims follow from premises, and the debater does not contradict earlier rounds.
2. Factual citation: specific, checkable sources or figures beat slogans and unsourced assertions.
3. Argument strength: the case answers the prompt, engages the opponent, and leaves fewer unanswered points.
Return winner_id as exactly one of the two candidate ids in the prompt, or the string "tie" when those criteria are even.
Write judge_reasoning as a single paragraph that names the deciding criterion.
Do not invent quotes, sources, or arguments that are not in the transcript.
If the transcript has no arguments, return "tie".`;

type TranscriptMessage = {
  author_id: string;
  round_number: number;
  content: string;
  created_at: string;
};

function labelFor(
  authorId: string,
  names: Map<string, string>,
  candidateAId: string,
  candidateBId: string,
) {
  const name = names.get(authorId);
  if (authorId === candidateAId) return name ? `Candidate A (${name})` : "Candidate A";
  if (authorId === candidateBId) return name ? `Candidate B (${name})` : "Candidate B";
  return name ?? authorId;
}

export async function evaluateDebateTranscript(debateId: string): Promise<DebateVerdict> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("debates")
    .select(
      "id, topic, candidate_a_id, candidate_b_id, candidate_a_argument, candidate_b_argument",
    )
    .eq("id", debateId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const debate = data as {
    id: string;
    topic: string;
    candidate_a_id: string | null;
    candidate_b_id: string | null;
    candidate_a_argument: string | null;
    candidate_b_argument: string | null;
  } | null;
  if (!debate?.candidate_a_id || !debate.candidate_b_id) {
    throw new Error("Both debaters must be seated before the transcript can be judged.");
  }

  const candidateAId = debate.candidate_a_id;
  const candidateBId = debate.candidate_b_id;
  const { data: messageRows, error: messageError } = await admin
    .from("arguments")
    .select("author_id, round_number, content, created_at")
    .eq("debate_id", debateId)
    .order("round_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (messageError) throw new Error(messageError.message);
  const messages = (messageRows ?? []) as TranscriptMessage[];

  const { data: users, error: userError } = await admin
    .from("users")
    .select("id, username")
    .in("id", [candidateAId, candidateBId]);
  if (userError) throw new Error(userError.message);
  const names = new Map(
    ((users ?? []) as { id: string; username: string | null }[]).map((row) => [
      row.id,
      row.username?.trim() || "Debater",
    ]),
  );

  const lines: string[] = [];
  if (debate.candidate_a_argument?.trim()) {
    lines.push(
      `${labelFor(candidateAId, names, candidateAId, candidateBId)} opening:\n${debate.candidate_a_argument.trim()}`,
    );
  }
  if (debate.candidate_b_argument?.trim()) {
    lines.push(
      `${labelFor(candidateBId, names, candidateAId, candidateBId)} opening:\n${debate.candidate_b_argument.trim()}`,
    );
  }
  for (const message of messages) {
    const content = message.content?.trim();
    if (!content) continue;
    lines.push(
      `Round ${message.round_number} · ${labelFor(message.author_id, names, candidateAId, candidateBId)}:\n${content}`,
    );
  }

  if (lines.length === 0) {
    return {
      winner_id: "tie",
      judge_reasoning:
        "Neither debater filed an argument, so the match is a tie under the competitive rubric.",
    };
  }

  const { object } = await generateObject({
    model: openai(process.env.DEBATE_JUDGE_MODEL?.trim() || "gpt-4o"),
    schema: verdictSchema,
    schemaName: "DebateVerdict",
    schemaDescription: "Competitive debate winner and a one-paragraph explanation.",
    system: SYSTEM_PROMPT,
    prompt: [
      `Topic: ${debate.topic}`,
      `Candidate A id: ${candidateAId}`,
      `Candidate B id: ${candidateBId}`,
      "",
      "Transcript:",
      lines.join("\n\n"),
    ].join("\n"),
  });

  const picked = object.winner_id.trim();
  const winner_id =
    picked === "tie" || picked.toLowerCase() === "tie"
      ? "tie"
      : picked === candidateAId || picked === candidateBId
        ? picked
        : null;
  if (!winner_id) {
    throw new Error("The judge returned a winner that is not one of the seated debaters.");
  }

  return {
    winner_id,
    judge_reasoning: object.judge_reasoning.trim(),
  };
}
