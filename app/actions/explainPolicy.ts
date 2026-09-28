"use server";

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const POLICY_LIMIT = 6000;

/**
 * Non-partisan breakdown of a debate policy.
 * Returns a 1-sentence core concept, the strongest pro and con points,
 * and the estimated fiscal and legal impact.
 */
export async function explainPolicy(policyText: string) {
  const policy = policyText.trim();
  if (!policy) throw new Error("A policy is required.");

  const { text } = await generateText({
    model: openai("gpt-4o"),
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
  return breakdown;
}
