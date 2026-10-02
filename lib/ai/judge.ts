import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { resolveTextModel } from "@/lib/ai/provider";
import {
  adherenceScore,
  clampAxis,
  clampUnit,
  DEFAULT_ELO,
  driftCoordinate,
  eloDelta,
  movingAverageDrift,
  nextElo,
  withinAdherencePoints,
  withinTieMargin,
  type AxisPoint,
} from "@/lib/platform/scoring";
import { notifyDebateConcluded } from "@/lib/actions/notifications";
import {
  loadArenaById,
  loadProfile,
  loadPrompt,
  loadStanding,
  platformAdmin,
  recomputeTier,
  type PlatformAdmin,
} from "@/lib/platform/records";
import type { PublicJudgment } from "@/lib/platform/types";

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

const coordinateSchema = z.object({
  x: z.number().describe("Economic axis, from -1 to 1, where this stance sits."),
  y: z.number().describe("Social axis, from -1 to 1, where this stance sits."),
});

const adjudicationSchema = z.object({
  candidate_a_adherence: z
    .number()
    .min(0)
    .max(100)
    .describe("How closely stance A matches the primary baseline, from 0 to 100."),
  candidate_b_adherence: z
    .number()
    .min(0)
    .max(100)
    .describe("How closely stance B matches the primary baseline, from 0 to 100."),
  candidate_a_coordinate_shift: coordinateSchema,
  candidate_b_coordinate_shift: coordinateSchema,
});

const ADJUDICATION_PROMPT = [
  "You are an impartial political science judge.",
  "Score each stance only by how closely it adheres to the primary baseline ideology.",
  "Economic x and social y are each between -1 and 1.",
  "Economic -1 is more public-sector; +1 is more market-oriented.",
  "Social -1 is more personal liberty; +1 is more traditional order.",
  "candidate_a_adherence and candidate_b_adherence run from 0 to 100.",
  "100 matches the baseline. 0 opposes it.",
  "candidate_a_coordinate_shift and candidate_b_coordinate_shift are the economic (x) and social (y) coordinates where that stance sits.",
  "Plot the argument itself. Do not explain the scores.",
].join(" ");

type SideJudgments = {
  a: PublicJudgment;
  b: PublicJudgment;
};

function pointOf(profile: { ideology_x: number | null; ideology_y: number | null }): AxisPoint {
  return {
    x: profile.ideology_x ?? 0,
    y: profile.ideology_y ?? 0,
  };
}

function judgments(args: {
  winner: "a" | "b" | "tie";
  deltaA: number;
  deltaB: number;
  coordinateA: AxisPoint;
  coordinateB: AxisPoint;
}): SideJudgments {
  const outcomeA = args.winner === "tie" ? "tie" : args.winner === "a" ? "win" : "loss";
  const outcomeB = args.winner === "tie" ? "tie" : args.winner === "b" ? "win" : "loss";
  return {
    a: { outcome: outcomeA, eloDelta: args.deltaA, coordinate: args.coordinateA },
    b: { outcome: outcomeB, eloDelta: args.deltaB, coordinate: args.coordinateB },
  };
}

function clampAdherence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function plottedFallback(point: AxisPoint, baseline: AxisPoint) {
  return {
    adherence: Math.round(adherenceScore(point, baseline) * 100),
    coordinate: { x: clampAxis(point.x), y: clampAxis(point.y) },
  };
}

type PlottedStance = {
  adherence: number;
  coordinate: AxisPoint;
};

/**
 * Internal plot of both stances. The object never leaves the server.
 * A missing model falls back to geometric adherence and does not invent a new coordinate.
 */
async function plotAdherence(input: {
  prompt: string;
  baseline: AxisPoint;
  stanceA: string;
  stanceB: string;
  pointA: AxisPoint;
  pointB: AxisPoint;
}): Promise<{ a: PlottedStance; b: PlottedStance }> {
  const fallback = {
    a: plottedFallback(input.pointA, input.baseline),
    b: plottedFallback(input.pointB, input.baseline),
  };
  const resolved = resolveTextModel(process.env.DEBATE_JUDGE_MODEL?.trim() || "gpt-4o");
  if (!resolved) return fallback;

  try {
    const { object } = await generateObject({
      model: resolved.model,
      schema: adjudicationSchema,
      schemaName: "IdeologyAdherence",
      schemaDescription: "Hidden adherence scores and plotted coordinates. No explanation.",
      system: ADJUDICATION_PROMPT,
      prompt: [
        `Baseline x: ${input.baseline.x}`,
        `Baseline y: ${input.baseline.y}`,
        input.prompt ? `Question: ${input.prompt}` : "",
        `Stance A: ${input.stanceA}`,
        `Stance B: ${input.stanceB}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    return {
      a: {
        adherence: clampAdherence(object.candidate_a_adherence),
        coordinate: {
          x: clampAxis(object.candidate_a_coordinate_shift.x),
          y: clampAxis(object.candidate_a_coordinate_shift.y),
        },
      },
      b: {
        adherence: clampAdherence(object.candidate_b_adherence),
        coordinate: {
          x: clampAxis(object.candidate_b_coordinate_shift.x),
          y: clampAxis(object.candidate_b_coordinate_shift.y),
        },
      },
    };
  } catch {
    return fallback;
  }
}

async function writeStanding(
  admin: PlatformAdmin,
  userId: string,
  primaryId: string,
  next: { elo: number; debates: number; wins: number; losses: number; ties: number },
) {
  const existing = await loadStanding(admin, userId, primaryId);
  const patch = {
    elo: next.elo,
    debates_count: next.debates,
    wins: next.wins,
    losses: next.losses,
    ties: next.ties,
    updated_at: new Date().toISOString(),
  };
  if (!existing) {
    const { error } = await admin.from("primary_standings").insert({
      user_id: userId,
      primary_id: primaryId,
      ...patch,
    });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await admin.from("primary_standings").update(patch).eq("id", existing.id);
  if (error) throw new Error(error.message);
}

async function settleArena(input: {
  debateId: string;
  drift: boolean;
  scores: { a: number; b: number } | null;
}) {
  const admin = platformAdmin();
  const debate = await loadArenaById(admin, input.debateId);
  if (!debate) throw new Error("That debate is not on the board.");
  if (!debate.candidate_b_id) throw new Error("Both contenders have to be seated.");

  const [primaryResult, profileA, profileB] = await Promise.all([
    admin
      .from("primaries")
      .select("id, baseline_x, baseline_y, slug")
      .eq("id", debate.primary_id)
      .maybeSingle(),
    loadProfile(admin, debate.candidate_a_id),
    loadProfile(admin, debate.candidate_b_id),
  ]);
  if (primaryResult.error) throw new Error(primaryResult.error.message);
  const primary = primaryResult.data as { id: string; baseline_x: number; baseline_y: number } | null;
  if (!primary || !profileA || !profileB) throw new Error("The primary or a contender is missing.");

  if (debate.status === "concluded") {
    return judgments({
      winner: debate.is_tie ? "tie" : debate.winner_id === debate.candidate_a_id ? "a" : "b",
      deltaA: 0,
      deltaB: 0,
      coordinateA: pointOf(profileA),
      coordinateB: pointOf(profileB),
    });
  }

  const standingA = await loadStanding(admin, debate.candidate_a_id, debate.primary_id);
  const standingB = await loadStanding(admin, debate.candidate_b_id, debate.primary_id);
  const ratingA = standingA?.elo ?? 1200;
  const ratingB = standingB?.elo ?? 1200;
  const baseline = { x: primary.baseline_x, y: primary.baseline_y };
  const currentA = pointOf(profileA);
  const currentB = pointOf(profileB);

  let winner: "a" | "b" | "tie" = "tie";
  if (input.scores && !withinTieMargin(input.scores.a, input.scores.b)) {
    winner = input.scores.a > input.scores.b ? "a" : "b";
  }
  if (!input.scores) winner = "a";

  const outcomeA = winner === "tie" ? 0.5 : winner === "a" ? 1 : 0;
  const outcomeB = 1 - outcomeA;
  const deltaA = eloDelta(ratingA, ratingB, outcomeA);
  const deltaB = eloDelta(ratingB, ratingA, outcomeB);
  const coordinateA =
    input.drift && input.scores
      ? driftCoordinate(currentA, baseline, input.scores.a, standingA?.debates_count ?? 0)
      : currentA;
  const coordinateB =
    input.drift && input.scores
      ? driftCoordinate(currentB, baseline, input.scores.b, standingB?.debates_count ?? 0)
      : currentB;

  const bump = (standing: typeof standingA, won: boolean) => ({
    debates: (standing?.debates_count ?? 0) + 1,
    wins: (standing?.wins ?? 0) + (winner !== "tie" && won ? 1 : 0),
    losses: (standing?.losses ?? 0) + (winner !== "tie" && !won ? 1 : 0),
    ties: (standing?.ties ?? 0) + (winner === "tie" ? 1 : 0),
  });
  const nextA = bump(standingA, winner === "a");
  const nextB = bump(standingB, winner === "b");

  await writeStanding(admin, debate.candidate_a_id, debate.primary_id, {
    elo: nextElo(ratingA, deltaA),
    ...nextA,
  });
  await writeStanding(admin, debate.candidate_b_id, debate.primary_id, {
    elo: nextElo(ratingB, deltaB),
    ...nextB,
  });

  if (input.drift) {
    const now = new Date().toISOString();
    const { error: errorA } = await admin
      .from("profiles")
      .update({ ideology_x: coordinateA.x, ideology_y: coordinateA.y, updated_at: now })
      .eq("id", debate.candidate_a_id);
    if (errorA) throw new Error(errorA.message);
    const { error: errorB } = await admin
      .from("profiles")
      .update({ ideology_x: coordinateB.x, ideology_y: coordinateB.y, updated_at: now })
      .eq("id", debate.candidate_b_id);
    if (errorB) throw new Error(errorB.message);
  }

  const winnerId =
    winner === "tie" ? null : winner === "a" ? debate.candidate_a_id : debate.candidate_b_id;
  const { error: debateError } = await admin
    .from("arena_debates")
    .update({
      status: "concluded",
      winner_id: winnerId,
      is_tie: winner === "tie",
      candidate_a_score: input.scores?.a ?? null,
      candidate_b_score: input.scores?.b ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", debate.id);
  if (debateError) throw new Error(debateError.message);

  const { error: promptError } = await admin
    .from("debate_prompts")
    .update({ status: "concluded" })
    .eq("id", debate.prompt_id);
  if (promptError) throw new Error(promptError.message);

  await recomputeTier(admin, debate.candidate_a_id);
  await recomputeTier(admin, debate.candidate_b_id);

  return judgments({
    winner,
    deltaA,
    deltaB,
    coordinateA,
    coordinateB,
  });
}

/**
 * Score both stances against the primary baseline.
 * Returns only the public outcome, Elo delta, and updated coordinate.
 * Adherence scores and any model text stay on the server.
 */
export async function adjudicateDebate(debateId: string): Promise<SideJudgments> {
  const admin = platformAdmin();
  const debate = await loadArenaById(admin, debateId);
  if (!debate) throw new Error("That debate is not on the board.");
  if (!debate.candidate_b_id) throw new Error("Both contenders have to be seated.");
  const stanceA = debate.stance_a.trim();
  const stanceB = debate.stance_b?.trim() ?? "";
  if (!stanceA || !stanceB) throw new Error("Both stances have to be filed before judging.");

  const stored = await admin
    .from("arena_debates")
    .select("candidate_a_score, candidate_b_score")
    .eq("id", debate.id)
    .maybeSingle();
  if (stored.error) throw new Error(stored.error.message);
  const saved = stored.data as {
    candidate_a_score: number | null;
    candidate_b_score: number | null;
  } | null;

  const [primaryResult, profileA, profileB, prompt] = await Promise.all([
    admin
      .from("primaries")
      .select("id, baseline_x, baseline_y")
      .eq("id", debate.primary_id)
      .maybeSingle(),
    loadProfile(admin, debate.candidate_a_id),
    loadProfile(admin, debate.candidate_b_id),
    loadPrompt(admin, debate.prompt_id),
  ]);
  if (primaryResult.error) throw new Error(primaryResult.error.message);
  const primary = primaryResult.data as { id: string; baseline_x: number; baseline_y: number } | null;
  if (!primary || !profileA || !profileB) throw new Error("The primary or a contender is missing.");

  const currentA = pointOf(profileA);
  const currentB = pointOf(profileB);
  if (
    debate.status === "concluded" &&
    saved?.candidate_a_score != null &&
    saved.candidate_b_score != null
  ) {
    return judgments({
      winner: debate.is_tie ? "tie" : debate.winner_id === debate.candidate_a_id ? "a" : "b",
      deltaA: 0,
      deltaB: 0,
      coordinateA: currentA,
      coordinateB: currentB,
    });
  }

  const plotted = await plotAdherence({
    prompt: prompt?.prompt_text ?? "",
    baseline: { x: primary.baseline_x, y: primary.baseline_y },
    stanceA,
    stanceB,
    pointA: currentA,
    pointB: currentB,
  });
  const winner = withinAdherencePoints(plotted.a.adherence, plotted.b.adherence)
    ? "tie"
    : plotted.a.adherence > plotted.b.adherence
      ? "a"
      : "b";

  const standingA = await loadStanding(admin, debate.candidate_a_id, debate.primary_id);
  const standingB = await loadStanding(admin, debate.candidate_b_id, debate.primary_id);
  const ratingA = standingA?.elo ?? DEFAULT_ELO;
  const ratingB = standingB?.elo ?? DEFAULT_ELO;
  const outcomeA = winner === "tie" ? 0.5 : winner === "a" ? 1 : 0;
  const outcomeB = 1 - outcomeA;
  const deltaA = eloDelta(ratingA, ratingB, outcomeA);
  const deltaB = eloDelta(ratingB, ratingA, outcomeB);
  const coordinateA = movingAverageDrift(currentA, plotted.a.coordinate);
  const coordinateB = movingAverageDrift(currentB, plotted.b.coordinate);

  const bump = (standing: typeof standingA, won: boolean) => ({
    debates: (standing?.debates_count ?? 0) + 1,
    wins: (standing?.wins ?? 0) + (winner !== "tie" && won ? 1 : 0),
    losses: (standing?.losses ?? 0) + (winner !== "tie" && !won ? 1 : 0),
    ties: (standing?.ties ?? 0) + (winner === "tie" ? 1 : 0),
  });
  const nextA = bump(standingA, winner === "a");
  const nextB = bump(standingB, winner === "b");

  await writeStanding(admin, debate.candidate_a_id, debate.primary_id, {
    elo: nextElo(ratingA, deltaA),
    ...nextA,
  });
  await writeStanding(admin, debate.candidate_b_id, debate.primary_id, {
    elo: nextElo(ratingB, deltaB),
    ...nextB,
  });

  const now = new Date().toISOString();
  const { error: errorA } = await admin
    .from("profiles")
    .update({ ideology_x: coordinateA.x, ideology_y: coordinateA.y, updated_at: now })
    .eq("id", debate.candidate_a_id);
  if (errorA) throw new Error(errorA.message);
  const { error: errorB } = await admin
    .from("profiles")
    .update({ ideology_x: coordinateB.x, ideology_y: coordinateB.y, updated_at: now })
    .eq("id", debate.candidate_b_id);
  if (errorB) throw new Error(errorB.message);

  const winnerId =
    winner === "tie" ? null : winner === "a" ? debate.candidate_a_id : debate.candidate_b_id;
  const { error: debateError } = await admin
    .from("arena_debates")
    .update({
      status: "concluded",
      winner_id: winnerId,
      is_tie: winner === "tie",
      candidate_a_score: clampUnit(plotted.a.adherence / 100),
      candidate_b_score: clampUnit(plotted.b.adherence / 100),
      updated_at: now,
    })
    .eq("id", debate.id);
  if (debateError) throw new Error(debateError.message);

  const { error: promptError } = await admin
    .from("debate_prompts")
    .update({ status: "concluded" })
    .eq("id", debate.prompt_id);
  if (promptError) throw new Error(promptError.message);

  await recomputeTier(admin, debate.candidate_a_id);
  await recomputeTier(admin, debate.candidate_b_id);
  await notifyDebateConcluded(debate.id, debate.candidate_a_id, debate.candidate_b_id);

  return judgments({
    winner,
    deltaA,
    deltaB,
    coordinateA,
    coordinateB,
  });
}

export async function judgeArenaExchange(debateId: string): Promise<SideJudgments> {
  return adjudicateDebate(debateId);
}

/** A locked seat that never received a rebuttal. No coordinate drift. */
export async function forfeitArenaSeat(debateId: string): Promise<SideJudgments> {
  return settleArena({ debateId, drift: false, scores: null });
}
