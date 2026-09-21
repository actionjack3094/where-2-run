import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
  countWords,
  majorityPass,
  PUBLIC_RUBRIC,
  RUBRIC_FLAGS,
} from "@/lib/arena/evaluations";

export const PRIMARY_JUDGE_MODEL = "gpt-4o";

export const ENSEMBLE_MODELS = [
  { id: "gpt-4o", label: "gpt-4o" },
  { id: "claude-3-5-sonnet-latest", label: "claude-3-5-sonnet" },
  { id: "gemini-1.5-pro", label: "gemini-1.5-pro" },
] as const;

const primaryVerdictSchema = z.object({
  score: z.number().min(0).max(100),
  confidence_score: z.number().min(0).max(1),
  rubric_flag: z.string().min(1),
});

const ensembleVoteSchema = z.object({
  pass: z.boolean(),
  rationale: z.string().min(1),
});

export type PrimaryVerdict = z.infer<typeof primaryVerdictSchema>;
export type EnsembleVote = z.infer<typeof ensembleVoteSchema> & {
  model: string;
};

type LanguageModel = Parameters<typeof generateText>[0]["model"];

function languageModelFor(modelId: string): LanguageModel {
  if (modelId.startsWith("claude")) return anthropic(modelId);
  if (modelId.startsWith("gemini")) return google(modelId);
  return openai(modelId);
}

function hasProviderKey(modelId: string) {
  if (process.env.AI_GATEWAY_API_KEY) return true;
  if (modelId.startsWith("claude")) return Boolean(process.env.ANTHROPIC_API_KEY);
  if (modelId.startsWith("gemini")) {
    return Boolean(
      process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY,
    );
  }
  return Boolean(process.env.OPENAI_API_KEY);
}

function normalizeFlag(flag: string) {
  const slug = flag
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return (RUBRIC_FLAGS as readonly string[]).includes(slug)
    ? slug
    : slug || "positional_consistency";
}

function mockPrimaryVerdict(debateText: string, topic: string): PrimaryVerdict {
  const words = countWords(`${topic} ${debateText}`);
  const score = Math.max(12, Math.min(96, 38 + Math.min(words, 420) / 7));
  const confidence =
    words < 36 ? 0.48 : words < 90 ? 0.68 : words < 180 ? 0.81 : 0.93;
  const rubric_flag =
    words < 48
      ? "anti_troll"
      : words < 110
        ? "local_mechanism"
        : words < 200
          ? "evidence_over_slogans"
          : "positional_consistency";
  return {
    score: Math.round(score * 10) / 10,
    confidence_score: Math.round(confidence * 100) / 100,
    rubric_flag,
  };
}

function mockEnsembleVote(
  model: string,
  addendum: string,
  rubricFlag: string,
): EnsembleVote {
  const words = countWords(addendum);
  const haystack = addendum.toLowerCase();
  const flagTokens = rubricFlag.replace(/_/g, " ").split(" ").filter(Boolean);
  const namesFlag =
    haystack.includes(rubricFlag.replace(/_/g, " ")) ||
    haystack.includes(rubricFlag) ||
    flagTokens.some((token) => token.length > 3 && haystack.includes(token));
  const pass =
    model === "gemini-1.5-pro"
      ? words >= 24 && namesFlag
      : model === "claude-3-5-sonnet"
        ? words >= 18
        : namesFlag && words >= 12;
  return {
    model,
    pass,
    rationale: pass
      ? "The addendum names the flagged criterion and supplies a concrete clarification."
      : "The addendum does not resolve the named rubric flag.",
  };
}

export function assembleDebateText(
  topic: string,
  argumentsByRound: Array<{ round_number: number; content: string }>,
) {
  const body = [...argumentsByRound]
    .sort((left, right) => left.round_number - right.round_number)
    .map((entry) => `Round ${entry.round_number}:\n${entry.content.trim()}`)
    .join("\n\n");
  return `Topic: ${topic.trim()}\n\n${body || "(No arguments filed.)"}`;
}

async function generatePrimaryVerdict(prompt: string): Promise<PrimaryVerdict> {
  const { output } = await generateText({
    model: languageModelFor(PRIMARY_JUDGE_MODEL),
    output: Output.object({
      schema: primaryVerdictSchema,
      name: "PrimaryJudgeVerdict",
      description: "Structured JSON score, confidence, and rubric flag.",
    }),
    system: `You are the Primary Judge of the WHERE 2 RUN civic arena. Apply only the public rubric. Return structured JSON with score (0-100), confidence_score (0-1), and rubric_flag (snake_case criterion).`,
    prompt,
    temperature: 0.2,
  });
  return {
    score: output.score,
    confidence_score: output.confidence_score,
    rubric_flag: normalizeFlag(output.rubric_flag),
  };
}

async function generateEnsembleVote(
  modelId: string,
  label: string,
  prompt: string,
): Promise<EnsembleVote> {
  const { output } = await generateText({
    model: languageModelFor(modelId),
    output: Output.object({
      schema: ensembleVoteSchema,
      name: "EnsembleVote",
      description: "Pass or fail vote on whether the addendum resolves the rubric flag.",
    }),
    system:
      "You are one vote on the WHERE 2 RUN Ensemble Court. Vote pass only if the addendum specifically resolves the named rubric_flag against the public rubric. Ignore campaign biography and new topics.",
    prompt,
    temperature: 0.1,
  });
  return { model: label, pass: output.pass, rationale: output.rationale };
}

export async function runPrimaryJudge(input: {
  topic: string;
  debateText: string;
}): Promise<PrimaryVerdict> {
  const prompt = `${PUBLIC_RUBRIC}

DEBATE TEXT
${input.debateText}

Score this candidate only. Do not compare opponents.`;

  if (!hasProviderKey(PRIMARY_JUDGE_MODEL)) {
    console.warn("Primary Judge: no LLM key; using local rubric fallback.");
    return mockPrimaryVerdict(input.debateText, input.topic);
  }

  try {
    return await generatePrimaryVerdict(prompt);
  } catch (error) {
    console.error("Primary Judge LLM failed; using local rubric fallback.", error);
    return mockPrimaryVerdict(input.debateText, input.topic);
  }
}

export async function runEnsembleCourt(input: {
  topic: string;
  debateText: string;
  rubricFlag: string;
  addendumText: string;
}) {
  const prompt = `${PUBLIC_RUBRIC}

ORIGINAL DEBATE TEXT
${input.debateText}

PRIMARY JUDGE FLAG
${input.rubricFlag}

CANDIDATE ADDENDUM (max 150 words)
${input.addendumText}

Vote pass if the addendum clarifies that specific flag. Vote fail otherwise.`;

  const votes = await Promise.all(
    ENSEMBLE_MODELS.map(async (model) => {
      if (!hasProviderKey(model.id)) {
        console.warn(`Ensemble Court: no key for ${model.label}; using local vote.`);
        return mockEnsembleVote(model.label, input.addendumText, input.rubricFlag);
      }
      try {
        return await generateEnsembleVote(model.id, model.label, prompt);
      } catch (error) {
        console.error(`Ensemble Court ${model.label} failed; using local vote.`, error);
        return mockEnsembleVote(model.label, input.addendumText, input.rubricFlag);
      }
    }),
  );

  const consensus = majorityPass(votes.map((vote) => vote.pass));
  return { votes, ...consensus };
}
