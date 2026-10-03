import { randomUUID } from "node:crypto";
import { generateObject } from "ai";
import { z } from "zod";
import { notifyChallengeAccepted } from "@/lib/actions/notifications";
import { adjudicateDebate } from "@/lib/ai/judge";
import { resolveTextModel } from "@/lib/ai/provider";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { primaryClosed } from "@/lib/platform/cycle";
import {
  loadArenaById,
  loadPrompt,
  platformAdmin,
  type PlatformAdmin,
} from "@/lib/platform/records";
import {
  euclidean,
  partyFromCoordinate,
  type AxisPoint,
  type Party,
} from "@/lib/platform/scoring";
import type { PublicJudgment } from "@/lib/platform/types";

/** Humans get this long to accept a new prompt before a synthetic partner may claim it. */
export const BOT_SPAR_GRACE_MS = 15 * 60 * 1000;

const STANCE_MIN = 20;
const STANCE_MAX = 2000;

export type SparringPersona = {
  key: string;
  name: string;
  party: Party;
  x: number;
  y: number;
  stance: string;
};

export const SPARRING_PERSONAS: SparringPersona[] = [
  {
    key: "blue-dog",
    name: "Blue Dog",
    party: "democrat",
    x: -0.28,
    y: 0.12,
    stance:
      "I want a Democratic primary that can win suburban counties: a public option, a secure border, and a narrow path to status.",
  },
  {
    key: "progressive",
    name: "Progressive",
    party: "democrat",
    x: -0.86,
    y: -0.72,
    stance:
      "I want Medicare for All, stronger unions, and civil-rights statutes with real enforcement.",
  },
  {
    key: "main-street",
    name: "Main Street",
    party: "republican",
    x: 0.34,
    y: 0.22,
    stance:
      "I want lower taxes for small employers, a secure border, and abortion policy set by the states.",
  },
  {
    key: "movement",
    name: "Movement Conservative",
    party: "republican",
    x: 0.82,
    y: 0.74,
    stance:
      "I want deep spending cuts, traditional standards in schools, and a much smaller federal code.",
  },
];

export type SparringBot = {
  id: string;
  name: string;
  x: number;
  y: number;
};

const rebuttalSchema = z.object({
  rebuttal: z
    .string()
    .describe("One plain-text rebuttal in the debater's own voice. No markdown, scores, or ruling."),
});

export type BotSparResult = {
  sparred: boolean;
  judgment?: PublicJudgment;
};

type ProfileRow = {
  id: string;
  ideology_x: number | null;
  ideology_y: number | null;
  display_name: string | null;
  full_name: string | null;
};

function partyName(party: Party) {
  return party === "democrat" ? "Democratic" : "Republican";
}

/** Closest same-party synthetic whose own coordinate is still inside that party. */
export function pickSparringBot(
  bots: SparringBot[],
  party: Party,
  baseline: AxisPoint,
  excludeId: string,
): SparringBot | null {
  const eligible = bots.filter((bot) => {
    if (!bot.id || bot.id === excludeId) return false;
    if (!Number.isFinite(bot.x) || !Number.isFinite(bot.y)) return false;
    return partyFromCoordinate(bot) === party;
  });
  eligible.sort(
    (a, b) => euclidean(a, baseline) - euclidean(b, baseline) || a.id.localeCompare(b.id),
  );
  return eligible[0] ?? null;
}

/** Collapse model output to a single plain-text stance inside the filing limits. */
export function plainRebuttal(text: string): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length < STANCE_MIN) return "";
  return plain.slice(0, STANCE_MAX);
}

function crossesParty(text: string, party: Party) {
  const lower = text.toLowerCase();
  if (party === "democrat") {
    return /\bas a republican\b|\bi am a republican\b|\bour republican primary\b/.test(lower);
  }
  return /\bas a democrat\b|\bi am a democrat\b|\bi am a democratic\b|\bour democratic primary\b/.test(lower);
}

export function fallbackRebuttal(input: {
  party: Party;
  name: string;
  x: number;
  y: number;
  prompt: string;
}): string {
  const question = input.prompt.replace(/\s+/g, " ").trim();
  const text = [
    `${input.name}. I am answering inside this ${partyName(input.party)} primary`,
    `from an economic position of ${input.x.toFixed(2)} and a social position of ${input.y.toFixed(2)}.`,
    question ? `On the question, ${question}` : "On this question",
    "I would narrow the promise to what our own primary voters will actually support,",
    "and I would judge the opening stance by whether it can carry this nomination.",
  ].join(" ");
  return plainRebuttal(text);
}

async function ensurePersona(admin: PlatformAdmin, persona: SparringPersona) {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("synthetic_key", persona.key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.id) return data.id as string;

  const email = `synthetic+${persona.key}@where2run.local`;
  const created = await admin.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: persona.name },
  });
  const userId = created.data.user?.id;
  const resolvedId =
    userId ??
    (await admin.auth.admin.listUsers({ page: 1, perPage: 200 })).data.users.find(
      (user) => user.email === email,
    )?.id;
  if (!resolvedId) {
    throw new Error(created.error?.message ?? "Could not seed a synthetic debater.");
  }
  const { error: profileError } = await admin.from("profiles").upsert({
    id: resolvedId,
    email,
    full_name: persona.name,
    display_name: persona.name,
    ideology_x: persona.x,
    ideology_y: persona.y,
    onboarding_completed: true,
    is_verified: false,
    is_synthetic: true,
    synthetic_key: persona.key,
    candidate_tier: "pundit",
    updated_at: new Date().toISOString(),
  });
  if (profileError) throw new Error(profileError.message);
  return resolvedId;
}

export async function ensureSparringRoster(admin: PlatformAdmin) {
  const ids = new Map<string, string>();
  for (const persona of SPARRING_PERSONAS) {
    ids.set(persona.key, await ensurePersona(admin, persona));
  }
  return ids;
}

async function listSyntheticBots(admin: PlatformAdmin): Promise<SparringBot[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, ideology_x, ideology_y, display_name, full_name")
    .eq("is_synthetic", true);
  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as ProfileRow[]).flatMap((row) => {
    if (row.ideology_x == null || row.ideology_y == null) return [];
    return [
      {
        id: row.id,
        name: row.display_name?.trim() || row.full_name?.trim() || "Sparring partner",
        x: row.ideology_x,
        y: row.ideology_y,
      },
    ];
  });
}

async function writeRebuttal(input: {
  party: Party;
  bot: SparringBot;
  prompt: string;
  opening: string;
  office: string;
}) {
  const fallback = fallbackRebuttal({
    party: input.party,
    name: input.bot.name,
    x: input.bot.x,
    y: input.bot.y,
    prompt: input.prompt,
  });
  const resolved = resolveTextModel(process.env.DEBATE_JUDGE_MODEL?.trim() || "gpt-4o");
  if (!resolved) return fallback;

  try {
    const { object } = await generateObject({
      model: resolved.model,
      schema: rebuttalSchema,
      schemaName: "BotRebuttal",
      schemaDescription: "A plain-text intra-party rebuttal.",
      system: [
        `You are ${input.bot.name}, a ${partyName(input.party)} primary debater.`,
        `Your ideology coordinate is economic ${input.bot.x.toFixed(2)}, social ${input.bot.y.toFixed(2)}.`,
        `Write one rebuttal in that voice for the ${partyName(input.party)} primary for ${input.office}.`,
        "Stay inside this party. Do not argue as the other party or switch primaries.",
        "Plain text only. No markdown, labels, scores, or a ruling.",
        "Answer the question and engage the opening stance in one short paragraph.",
      ].join(" "),
      prompt: [`Question: ${input.prompt}`, `Opening stance: ${input.opening}`].join("\n"),
    });
    const plain = plainRebuttal(object.rebuttal);
    if (!plain || crossesParty(plain, input.party)) return fallback;
    return plain;
  } catch {
    return fallback;
  }
}

/**
 * Claim an open human prompt with the closest same-party synthetic debater,
 * file that bot's rebuttal, and send the match through adjudication.
 * Adjudication writes both standings, both concluded notifications, and each
 * debater's own moving-average coordinate.
 */
export async function triggerBotSparring(debateId: string): Promise<BotSparResult> {
  if (!isUuid(debateId)) return { sparred: false };
  const admin = platformAdmin();
  const debate = await loadArenaById(admin, debateId);
  if (!debate || debate.status !== "open_challenge" || debate.candidate_b_id) {
    return { sparred: false };
  }

  const [primaryResult, prompt] = await Promise.all([
    admin
      .from("primaries")
      .select("id, party, office_name, baseline_x, baseline_y, status, primary_date")
      .eq("id", debate.primary_id)
      .maybeSingle(),
    loadPrompt(admin, debate.prompt_id),
  ]);
  let primaryQuery = primaryResult;
  if (primaryQuery.error && isMissingSchema(primaryQuery.error)) {
    primaryQuery = await admin
      .from("primaries")
      .select("id, party, office_name, baseline_x, baseline_y")
      .eq("id", debate.primary_id)
      .maybeSingle();
  }
  if (primaryQuery.error) throw new Error(primaryQuery.error.message);
  const primary = primaryQuery.data as {
    id: string;
    party: Party;
    office_name: string;
    baseline_x: number;
    baseline_y: number;
    status?: string | null;
    primary_date?: string | null;
  } | null;
  if (!primary || (primary.party !== "democrat" && primary.party !== "republican")) {
    return { sparred: false };
  }
  if (primaryClosed(primary)) return { sparred: false };
  if (!prompt || prompt.author_kind === "ai") return { sparred: false };

  let bots = await listSyntheticBots(admin);
  let bot = pickSparringBot(
    bots,
    primary.party,
    { x: primary.baseline_x, y: primary.baseline_y },
    debate.candidate_a_id,
  );
  if (!bot) {
    await ensureSparringRoster(admin);
    bots = await listSyntheticBots(admin);
    bot = pickSparringBot(
      bots,
      primary.party,
      { x: primary.baseline_x, y: primary.baseline_y },
      debate.candidate_a_id,
    );
  }
  if (!bot) return { sparred: false };

  const rebuttal = await writeRebuttal({
    party: primary.party,
    bot,
    prompt: prompt.prompt_text,
    opening: debate.stance_a,
    office: primary.office_name,
  });
  if (!rebuttal) return { sparred: false };

  const now = new Date().toISOString();
  const claimPatch = {
    candidate_b_id: bot.id,
    stance_b: rebuttal,
    status: "concluded" as const,
    seat_locked_until: null,
    bot_spar_at: null,
    updated_at: now,
  };
  const claim = () =>
    admin
      .from("arena_debates")
      .update(claimPatch)
      .eq("id", debate.id)
      .eq("status", "open_challenge")
      .is("candidate_b_id", null)
      .select("id")
      .maybeSingle();
  let claimed = await claim();
  if (claimed.error && isMissingSchema(claimed.error)) {
    const { bot_spar_at: _ignored, ...withoutSchedule } = claimPatch;
    claimed = await admin
      .from("arena_debates")
      .update(withoutSchedule)
      .eq("id", debate.id)
      .eq("status", "open_challenge")
      .is("candidate_b_id", null)
      .select("id")
      .maybeSingle();
  }
  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data) return { sparred: false };

  await notifyChallengeAccepted(debate.id, debate.candidate_a_id);
  const { error: promptError } = await admin
    .from("debate_prompts")
    .update({ status: "locked" })
    .eq("id", debate.prompt_id);
  if (promptError) throw new Error(promptError.message);

  try {
    const judged = await adjudicateDebate(debate.id);
    return { sparred: true, judgment: judged.a };
  } catch (caught) {
    await admin
      .from("arena_debates")
      .update({
        status: "open_challenge",
        candidate_b_id: null,
        stance_b: null,
        seat_locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", debate.id)
      .is("candidate_a_score", null);
    await admin.from("debate_prompts").update({ status: "open" }).eq("id", debate.prompt_id);
    console.error(
      "triggerBotSparring failed.",
      caught instanceof Error ? caught.message : "Could not close the sparring match.",
    );
    return { sparred: false };
  }
}

/** Claim human openings whose grace window has elapsed. */
export async function sparDueBotSeats(limit = 1): Promise<{ sparred: number }> {
  const admin = platformAdmin();
  const { data, error } = await admin
    .from("arena_debates")
    .select("id")
    .eq("status", "open_challenge")
    .is("candidate_b_id", null)
    .not("bot_spar_at", "is", null)
    .lte("bot_spar_at", new Date().toISOString())
    .order("bot_spar_at", { ascending: true })
    .limit(limit);
  if (error) {
    if (isMissingSchema(error)) return { sparred: 0 };
    throw new Error(error.message);
  }
  let sparred = 0;
  for (const row of (data ?? []) as { id: string }[]) {
    const result = await triggerBotSparring(row.id);
    if (result.sparred) sparred += 1;
  }
  return { sparred };
}
