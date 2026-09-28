"use server";

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const resolutionSchema = z.object({
  tone: z
    .enum(["neutral", "collaborative", "heated", "stalled"])
    .describe("The current emotional temperature of the channel."),
  friction_points: z
    .array(z.string())
    .describe("Specific, objective areas where User A and User B are misaligned."),
  proposed_compromise: z
    .string()
    .describe("A concrete, fair, and actionable step to resolve the block."),
  needs_cooldown: z
    .boolean()
    .describe("True if the AI recommends pausing the conversation to lower emotional heat."),
});

const SYSTEM_PROMPT =
  "You are a neutral, highly emotionally intelligent household operations mediator. You analyze transcripts between [User A] and [User B]. You do not take sides. Your goal is operational efficiency, emotional validation, and breaking gridlock. Provide objective analysis and concrete compromises.";

const CHANNEL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProfileJoin = {
  role: string;
  display_name: string;
};

type MessageRow = {
  content: string;
  created_at: string;
  profiles: ProfileJoin | ProfileJoin[] | null;
};

function profileFromJoin(value: MessageRow["profiles"]) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatTranscript(rows: MessageRow[]) {
  return rows
    .map((row) => {
      const profile = profileFromJoin(row.profiles);
      if (!profile || (profile.role !== "User A" && profile.role !== "User B")) {
        throw new Error("A message in this channel is missing a User A or User B profile.");
      }
      const name = profile.display_name.trim().replace(/\s+/g, " ").replace(/[\[\]]/g, "");
      const content = row.content.replace(/\s+/g, " ").trim();
      return `[${profile.role} (${name})]: ${content}`;
    })
    .join("\n");
}

/** Read a household channel and return a structured mediation resolution. */
export async function mediateChannel(channelId: string) {
  const id = channelId.trim();
  if (!CHANNEL_ID.test(id)) throw new Error("A mediation channel is required.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to mediate this channel.");

  const { data, error } = await supabase
    .from("channel_messages")
    .select("content, created_at, profiles(role, display_name)")
    .eq("channel_id", id)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as MessageRow[];
  if (rows.length === 0) throw new Error("This channel has no messages to mediate.");

  const transcript = formatTranscript(rows);

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: resolutionSchema,
    schemaName: "resolution",
    system: SYSTEM_PROMPT,
    prompt: transcript,
  });

  const resolution = resolutionSchema.parse(object);

  const { data: updated, error: updateError } = await supabase
    .from("mediation_channels")
    .update({ latest_resolution: resolution })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error("This channel is not in your household.");

  return resolution;
}
