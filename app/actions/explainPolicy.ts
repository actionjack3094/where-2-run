"use server";

import { generateText } from "ai";
import { isDevelopment, resolveTextModel } from "@/lib/ai/provider";

const POLICY_LIMIT = 6000;

export type ExplainPolicyResult =
  | { ok: true; breakdown: string; source: "openai" | "anthropic" | "mock" }
  | { ok: false; error: string };

const FRIENDLY_ERROR = "We couldn't explain this policy right now. Try again in a moment.";

function mockBreakdown(policy: string) {
  const firstSentence = policy.split(/(?<=[.!?])\s+/)[0]?.slice(0, 200) || policy.slice(0, 200);
  return `Core Concept: ${firstSentence}
Pros:
- Sample only: the strongest argument in favor would appear here.
Cons:
- Sample only: the strongest argument against would appear here.
Fiscal/Legal Impact: Sample only. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env.local for a real, non-partisan breakdown.`;
}

/**
 * Non-partisan breakdown of a debate policy.
 * Returns a 1-sentence core concept, the strongest pro and con points,
 * and the estimated fiscal and legal impact.
 *
 * Uses OpenAI when configured, falls back to Anthropic, and in development
 * with no keys returns a mock. Never throws credential errors to the client.
 */
export async function explainPolicy(policyText: string): Promise<ExplainPolicyResult> {
  const policy = (policyText ?? "").trim();
  if (!policy) return { ok: false, error: "A policy is required." };

  const resolved = resolveTextModel();

  if (!resolved) {
    if (isDevelopment()) {
      return { ok: true, breakdown: mockBreakdown(policy), source: "mock" };
    }
    console.error("explainPolicy: no OPENAI_API_KEY or ANTHROPIC_API_KEY configured.");
    return { ok: false, error: FRIENDLY_ERROR };
  }

  try {
    const { text } = await generateText({
      model: resolved.model,
      system: `You explain public policy for WHERE 2 RUN. Stay non-partisan. Do not endorse a party, candidate, or ideology. Do not invent statutes, dollar figures, or court holdings; say when the impact is uncertain.

Return exactly this structure:
Core Concept: <one sentence>
Pros:
- <strongest argument in favor>
- <a second argument, only if the policy text supports it>
Cons:
- <strongest argument against>
- <a second argument, only if the policy text supports it>
Fiscal/Legal Impact: <estimated fiscal and legal impact in plain language>`,
      prompt: policy.slice(0, POLICY_LIMIT),
      temperature: 0.2,
    });

    const breakdown = text.trim();
    if (!breakdown) throw new Error("The explainer returned an empty breakdown.");
    return { ok: true, breakdown, source: resolved.provider };
  } catch (error) {
    console.error("explainPolicy failed.", error);
    if (isDevelopment()) {
      return { ok: true, breakdown: mockBreakdown(policy), source: "mock" };
    }
    return { ok: false, error: FRIENDLY_ERROR };
  }
}
