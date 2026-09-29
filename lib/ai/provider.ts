import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { generateText } from "ai";

export type TextModel = Parameters<typeof generateText>[0]["model"];

export type ResolvedTextModel = {
  model: TextModel;
  provider: "openai" | "anthropic";
};

const ANTHROPIC_FALLBACK_MODEL = "claude-sonnet-4-5";

export function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function hasKey(name: string) {
  return Boolean(process.env[name]?.trim());
}

/**
 * Pick a text model from whatever credentials are configured: OpenAI first,
 * then Anthropic. Returns null when neither key is present so callers can
 * degrade instead of letting the SDK throw a raw "API key is missing" error.
 */
export function resolveTextModel(openaiModelId = "gpt-4o"): ResolvedTextModel | null {
  if (hasKey("OPENAI_API_KEY")) {
    return { model: openai(openaiModelId), provider: "openai" };
  }
  if (hasKey("ANTHROPIC_API_KEY")) {
    return {
      model: anthropic(process.env.ANTHROPIC_FALLBACK_MODEL?.trim() || ANTHROPIC_FALLBACK_MODEL),
      provider: "anthropic",
    };
  }
  return null;
}

export function hasTextModel() {
  return resolveTextModel() !== null;
}
