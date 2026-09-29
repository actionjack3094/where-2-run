/**
 * Autonomous arena simulation.
 *
 * Seeds 20 voter personas on the V2 ideological sorting model, then every
 * 10 seconds asks 3–5 of them to take one structured action in the live arena.
 * Each bot has a static physical ballot (`home_ocd_ids`, Blue Cards) and a
 * starting ideological ballot (`matched_ocd_ids`, Red Cards). The service-role
 * client bypasses RLS so a single process can write as many users.
 *
 *   npm run arena:sim
 *   npm run arena:sim -- --once
 *   npm run arena:sim -- --coverage-only   (seed bots and TX-37 debates, no LLM tick)
 *
 * Every run first guarantees TX-37 (ocd-division/country:us/state:tx/cd:37)
 * traffic: one bot opens a floor, a second bot with a different ideology
 * answers it, and one floor is left open for a human challenger.
 *
 * Reads .env.local. Requires NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY (debate arguments and
 * comments) or ANTHROPIC_API_KEY (other structured actions).
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateObject, type LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const TICK_MS = 10_000;
const UNLOCK_STREAK = 10;
const EXCESS_WALLET = 400;
const AXIS_IDS = ["climate", "healthcare", "immigration", "economy", "social", "safety"] as const;
const REPORT_REASONS = ["bad_faith", "spam", "abandoned", "off_platform", "other"] as const;
const BASE_IDEOLOGIES = ["progressive", "conservative", "centrist"] as const;

type AxisId = (typeof AXIS_IDS)[number];
type Lean = [number, number, number, number, number, number];
type ReportReason = (typeof REPORT_REASONS)[number];
type DistrictKey = keyof typeof DISTRICTS;
type BaseIdeology = (typeof BASE_IDEOLOGIES)[number];
type DecisionMode = "red" | "blue" | "pledge" | "floor";

type Persona = {
  slug: string;
  callSign: string;
  voice: string;
  district: DistrictKey;
  lean: Lean;
  startingElo: number;
};

type SimAgent = {
  userId: string;
  persona: Persona;
};

type DebateBrief = {
  id: string;
  topic: string;
  status: string;
  candidateAId: string | null;
  candidateBId: string | null;
  districtId: string | null;
  electionId: string | null;
  ocdId: string | null;
};

type SpeechBrief = {
  kind: "comment" | "argument";
  id: string;
  debateId: string;
  authorId: string;
  body: string;
};

type CandidateBrief = {
  id: string;
  elo: number;
  tier: string;
};

type QuestionBrief = {
  id: string;
  prompt: string;
  axis: string;
  electionId: string;
  ocdIds: string[];
};

type CampaignTargetBrief = {
  id: string;
  userId: string;
  electionId: string;
  ocdId: string | null;
  alignmentStreak: number;
  isLocked: boolean;
  pledgedEscrow: number;
};

type ArenaContext = {
  elo: number;
  tier: string;
  ideology: BaseIdeology;
  districtId: string | null;
  electionId: string | null;
  homeOcdIds: string[];
  matchedOcdIds: string[];
  openFloors: DebateBrief[];
  activeDebates: DebateBrief[];
  votable: DebateBrief[];
  homeDebates: DebateBrief[];
  homeVotable: DebateBrief[];
  votedDebateIds: Set<string>;
  speech: SpeechBrief[];
  highElo: CandidateBrief[];
  coalitions: { id: string; name: string }[];
  unanswered: QuestionBrief[];
  redQuestions: QuestionBrief[];
  stance: number[];
  campaignTargets: CampaignTargetBrief[];
  lockedTargets: CampaignTargetBrief[];
  walletDollars: number;
};

const DISTRICTS = {
  tx10: {
    name: "Texas Congressional District 10",
    ocdId: "ocd-division/country:us/state:tx/cd:10",
  },
  tx37: {
    name: "Texas Congressional District 37",
    ocdId: "ocd-division/country:us/state:tx/cd:37",
  },
  txSenate: {
    name: "Texas Senate District 14",
    ocdId: "ocd-division/country:us/state:tx/sldu:14",
  },
  austin: {
    name: "Austin City Council District 9",
    ocdId: "ocd-division/country:us/state:tx/place:austin/council_district:9",
  },
  mi7: {
    name: "Michigan Congressional District 7",
    ocdId: "ocd-division/country:us/state:mi/cd:7",
  },
} as const;

/** Starting Red Card. Physical home can differ from this ideological assignment. */
const IDEOLOGY_BALLOT: Record<BaseIdeology, readonly DistrictKey[]> = {
  progressive: ["austin", "tx37"],
  conservative: ["tx10", "mi7"],
  centrist: ["mi7", "txSenate"],
};

/**
 * District centroids from supabase/seed.sql. New bots start on the centroid
 * for their ideology so calibrate_district_alignment can anchor a streak.
 */
const IDEOLOGY_CENTROID: Record<BaseIdeology, readonly number[]> = {
  progressive: [0.8, 0.82, 0.42, 0.34, 0.69, 0.82, 0.26, 0.34, 0.77, 0.74],
  conservative: [0.32, 0.34, 0.74, 0.64, 0.28, 0.34, 0.7, 0.64, 0.31, 0.3],
  centrist: [0.48, 0.47, 0.56, 0.58, 0.46, 0.47, 0.5, 0.58, 0.49, 0.5],
};

const IDEOLOGY_VOICE: Record<BaseIdeology, string> = {
  progressive:
    "Progressive. Public investment, labor power, climate build-out, and civil rights. Do not drift conservative.",
  conservative:
    "Conservative. Markets, traditional institutions, border control, and limited government. Do not drift progressive.",
  centrist:
    "Centrist. Name the tradeoff, refuse both partisan scripts, and keep the claim local and specific.",
};

const AXIS_POLES: Record<AxisId, { low: string; high: string }> = {
  climate: { low: "fossil expansion", high: "public renewables" },
  healthcare: { low: "private markets", high: "single-payer" },
  immigration: { low: "restriction", high: "pathway and expansion" },
  economy: { low: "tax cuts and deregulation", high: "labor and progressive tax" },
  social: { low: "traditional defaults", high: "codified civil rights" },
  safety: { low: "zero-tolerance patrol", high: "prevention and responders" },
};

/** Twenty voters. Lean is the six-axis unit vector: climate, healthcare, immigration, economy, social, safety. */
const PERSONAS: Persona[] = [
  {
    slug: "lib-tech",
    callSign: "Aggressive Libertarian",
    voice: "Aggressive Libertarian tech worker. Hates zoning, licensing, and industrial policy. Pro immigration, pro civil liberties, allergic to taxes.",
    district: "tx10",
    lean: [0.12, 0.1, 0.82, 0.06, 0.74, 0.18],
    startingElo: 1475,
  },
  {
    slug: "prog-teacher",
    callSign: "Pragmatic Progressive",
    voice: "Pragmatic Progressive teacher. Wants funded schools, a public health option, and climate rules that a suburb can live with.",
    district: "austin",
    lean: [0.74, 0.78, 0.7, 0.72, 0.8, 0.66],
    startingElo: 1240,
  },
  {
    slug: "centrist-owner",
    callSign: "Centrist Owner",
    voice: "Centrist small business owner. Splits every question, fears both culture war and surprise tax bills, wants predictable local rules.",
    district: "tx37",
    lean: [0.46, 0.48, 0.44, 0.36, 0.5, 0.47],
    startingElo: 1210,
  },
  {
    slug: "union-electrician",
    callSign: "Union Electrician",
    voice: "Union electrician. Strong on wages, project labor agreements, and public power. Skeptical of open borders and police abolition.",
    district: "txSenate",
    lean: [0.62, 0.7, 0.4, 0.86, 0.55, 0.34],
    startingElo: 1280,
  },
  {
    slug: "rural-rancher",
    callSign: "Rural Rancher",
    voice: "Rural rancher. Property rights, water, and energy production come first. Dislikes Austin telling the county how to live.",
    district: "tx10",
    lean: [0.16, 0.22, 0.2, 0.18, 0.24, 0.2],
    startingElo: 1190,
  },
  {
    slug: "climate-scientist",
    callSign: "Climate Scientist",
    voice: "Climate scientist. Treats emissions timelines as the only adult conversation and will trade almost any other priority for a binding build-out.",
    district: "austin",
    lean: [0.96, 0.68, 0.6, 0.64, 0.7, 0.58],
    startingElo: 1330,
  },
  {
    slug: "evangelical-pastor",
    callSign: "Evangelical Pastor",
    voice: "Evangelical pastor. Traditional social policy, charity over entitlements, and a hard line on abortion and school curriculum.",
    district: "mi7",
    lean: [0.28, 0.3, 0.26, 0.24, 0.12, 0.32],
    startingElo: 1220,
  },
  {
    slug: "immigration-attorney",
    callSign: "Immigration Attorney",
    voice: "Immigration attorney. Due process, asylum capacity, and legal pathways. Impatient with both cruelty and slogans.",
    district: "tx37",
    lean: [0.58, 0.64, 0.92, 0.6, 0.78, 0.52],
    startingElo: 1260,
  },
  {
    slug: "retired-marine",
    callSign: "Retired Marine",
    voice: "Retired Marine. Order, veterans' care, and a secure border. Will back a Democrat on VA hospitals and a Republican on policing.",
    district: "mi7",
    lean: [0.34, 0.55, 0.22, 0.4, 0.36, 0.14],
    startingElo: 1410,
  },
  {
    slug: "campus-organizer",
    callSign: "Campus Organizer",
    voice: "Graduate student organizer. Rent control, police alternatives, and debt cancellation. Speaks in demands.",
    district: "austin",
    lean: [0.88, 0.9, 0.84, 0.9, 0.94, 0.86],
    startingElo: 1175,
  },
  {
    slug: "suburban-parent",
    callSign: "Suburban Parent",
    voice: "Suburban parent. Schools, property taxes, and traffic. Socially moderate, fiscally cautious, tired of national theater.",
    district: "tx10",
    lean: [0.42, 0.5, 0.4, 0.38, 0.48, 0.36],
    startingElo: 1200,
  },
  {
    slug: "public-nurse",
    callSign: "Public Health Nurse",
    voice: "Public health nurse. Staffing ratios, Medicaid expansion, and clinic access in towns that lost their hospital.",
    district: "mi7",
    lean: [0.6, 0.88, 0.58, 0.7, 0.66, 0.6],
    startingElo: 1255,
  },
  {
    slug: "oil-engineer",
    callSign: "Oilfield Engineer",
    voice: "Oilfield engineer. Domestic drilling, permitting speed, and nuclear as the serious climate tool. Mocks net-zero timelines.",
    district: "tx10",
    lean: [0.08, 0.28, 0.3, 0.14, 0.32, 0.26],
    startingElo: 1305,
  },
  {
    slug: "rights-litigator",
    callSign: "Civil Rights Litigator",
    voice: "Civil rights litigator. Voting access, policing consent decrees, and equal protection. High-ELO regular on the floor.",
    district: "tx37",
    lean: [0.7, 0.74, 0.8, 0.68, 0.96, 0.78],
    startingElo: 1520,
  },
  {
    slug: "chamber-chair",
    callSign: "Chamber Chair",
    voice: "Chamber of commerce chair. Incentives, tort reform, and workforce credentials. Polite, transactional, allergic to mandates.",
    district: "txSenate",
    lean: [0.3, 0.34, 0.48, 0.16, 0.4, 0.3],
    startingElo: 1360,
  },
  {
    slug: "tenant-organizer",
    callSign: "Tenant Organizer",
    voice: "Tenant organizer. Eviction defense, public housing, and corporate-landlord taxes. Local issues only, stated as moral claims.",
    district: "austin",
    lean: [0.66, 0.72, 0.64, 0.84, 0.76, 0.7],
    startingElo: 1185,
  },
  {
    slug: "gunsmith",
    callSign: "Second Amendment Gunsmith",
    voice: "Second Amendment gunsmith. Permitless carry, deep skepticism of registries, and a libertarian read of public safety.",
    district: "mi7",
    lean: [0.22, 0.26, 0.34, 0.2, 0.3, 0.08],
    startingElo: 1235,
  },
  {
    slug: "transit-planner",
    callSign: "Transit Planner",
    voice: "Transit planner. Bus lanes, land use around stations, and mode shift. Won't pretend a highway widening is climate policy.",
    district: "austin",
    lean: [0.8, 0.62, 0.55, 0.58, 0.64, 0.5],
    startingElo: 1270,
  },
  {
    slug: "family-farmer",
    callSign: "Family Farmer",
    voice: "Family-farm Democrat. Crop insurance, antitrust against packers, and conservation payments. Culturally traditional.",
    district: "mi7",
    lean: [0.52, 0.6, 0.36, 0.66, 0.34, 0.4],
    startingElo: 1215,
  },
  {
    slug: "crypto-founder",
    callSign: "Crypto Founder",
    voice: "Crypto founder. Securities clarity, anti-CBDC, and a flat-tax fantasy. Talks like a term sheet.",
    district: "tx37",
    lean: [0.2, 0.18, 0.7, 0.08, 0.62, 0.28],
    startingElo: 1290,
  },
];

const answerStance = z.object({
  action: z.literal("ANSWER_STANCE"),
  axis: z.enum(AXIS_IDS),
  score: z.number().min(1).max(100),
  rationale: z.string().min(8).max(280),
});

const proposeDebate = z.object({
  action: z.literal("PROPOSE_DEBATE"),
  question: z.string().min(12).max(280),
  axis: z.enum(AXIS_IDS),
  jurisdictionalLevel: z.enum(["federal", "state", "local"]),
});

const enterDebate = z.object({
  action: z.literal("ENTER_DEBATE"),
  opponentLabel: z.string().min(2).max(80),
  counterArgument: z.string().min(24).max(1500),
});

const voteSpectator = z.object({
  action: z.literal("VOTE_SPECTATOR"),
  debateTopic: z.string().min(2).max(280),
  side: z.enum(["a", "b"]),
  reason: z.string().min(8).max(280),
});

const flagUser = z.object({
  action: z.literal("FLAG_USER"),
  targetLabel: z.string().min(2).max(80),
  reason: z.enum(REPORT_REASONS),
  note: z.string().min(8).max(500),
});

const formCoalition = z.object({
  action: z.literal("FORM_COALITION"),
  name: z.string().min(2).max(80),
  charter: z.string().min(20).max(600),
});

const pledgeFunds = z.object({
  action: z.literal("PLEDGE_FUNDS"),
  candidateLabel: z.string().min(2).max(80),
  amountDollars: z.number().min(1).max(10_000),
  message: z.string().min(2).max(240),
});

const claimCandidacy = z.object({
  action: z.literal("CLAIM_CANDIDACY"),
  ballotName: z.string().min(2).max(120),
  officeSought: z.string().min(2).max(80),
  statement: z.string().min(12).max(500),
});

const leaveComment = z.object({
  action: z.literal("LEAVE_COMMENT"),
  debateTopic: z.string().min(2).max(280),
});

const agentActionSchema = z.discriminatedUnion("action", [
  answerStance,
  proposeDebate,
  enterDebate,
  voteSpectator,
  leaveComment,
  flagUser,
  formCoalition,
  pledgeFunds,
  claimCandidacy,
]);

type AgentAction = z.infer<typeof agentActionSchema>;

let admin: SupabaseClient | undefined;
const callSigns = new Map<string, string>();
const usernames = new Map<string, string>();
const wallets = new Map<string, number>();

function loadEnv() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) loadDotenv({ path, override: false });
  }
}

function db() {
  if (!admin) throw new Error("Arena sim client is not initialized.");
  return admin;
}

function simulationModel(): LanguageModel {
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-3-5-haiku-latest");
  throw new Error("Set OPENAI_API_KEY or ANTHROPIC_API_KEY before running the arena sim.");
}

function personaUserId(slug: string) {
  const hex = createHash("sha256").update(`where2run-arena-sim:${slug}`).digest("hex").slice(0, 32);
  const variant = ((Number.parseInt(hex[16] ?? "8", 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function startingWallet(slug: string) {
  const hex = createHash("sha256").update(`where2run-arena-sim-wallet:${slug}`).digest("hex");
  const roll = Number.parseInt(hex.slice(0, 4), 16);
  return 80 + (roll % 920);
}

function walletOf(userId: string) {
  return wallets.get(userId) ?? 0;
}

function ocdIdsFor(specific: string) {
  const parts = specific.split("/");
  const ids: string[] = [];
  for (let index = 2; index <= parts.length; index += 1) {
    ids.push(parts.slice(0, index).join("/"));
  }
  return ids;
}

function stateFromOcd(ocdId: string) {
  const match = ocdId.match(/state:([a-z]{2})/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function normalizeOcd(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function asOcdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return asOcdList(parsed);
    } catch {
      return trimmed
        .replace(/[{}]/g, "")
        .split(",")
        .map((entry) => entry.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    }
  }
  return [];
}

function ocdSet(ids: readonly string[]) {
  return new Set(ids.map((id) => normalizeOcd(id)).filter(Boolean));
}

function overlapsOcd(ids: readonly string[], wanted: ReadonlySet<string>) {
  return ids.some((id) => wanted.has(normalizeOcd(id)));
}

/** Progressive pole is the high end of climate, healthcare, economy, and social. */
function ideologyOf(persona: Persona): BaseIdeology {
  const lean = persona.lean;
  const score = ((lean[0] ?? 0.5) + (lean[1] ?? 0.5) + (lean[3] ?? 0.5) + (lean[4] ?? 0.5)) / 4;
  if (score >= 0.62) return "progressive";
  if (score <= 0.4) return "conservative";
  return "centrist";
}

function physicalBallot(persona: Persona) {
  return [districtFor(persona).ocdId];
}

function ideologicalBallot(persona: Persona) {
  return IDEOLOGY_BALLOT[ideologyOf(persona)].map((key) => DISTRICTS[key].ocdId);
}

function speechModel() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY before bots write debate arguments or comments.");
  }
  return openai("gpt-4o-mini");
}

function formatVector(values: readonly number[], size: number) {
  const padded = Array.from({ length: size }, (_, index) => {
    const value = values[index];
    const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value as number)) : 0.5;
    return clamped.toFixed(6);
  });
  return `[${padded.join(",")}]`;
}

function parseVector(value: unknown, size: number) {
  const raw = Array.isArray(value)
    ? value.map((entry) => Number(entry))
    : typeof value === "string"
      ? value
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((entry) => Number(entry.trim()))
      : [];
  return Array.from({ length: size }, (_, index) => {
    const entry = raw[index];
    return Number.isFinite(entry) ? Math.min(1, Math.max(0, entry as number)) : 0.5;
  });
}

function clip(value: string, max: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max - 1).trimEnd();
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unknown error";
}

function isDuplicate(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "23505" ||
    error.code === "email_exists" ||
    /already been registered|already exists|duplicate key/i.test(message)
  );
}

function isMissingUser(error: { message?: string; status?: number; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.status === 404 || error.code === "user_not_found" || /not found/i.test(message);
}

function missingColumn(message: string) {
  return (
    /could not find the '([^']+)' column/i.exec(message)?.[1] ??
    /column "([^"]+)" of relation/i.exec(message)?.[1] ??
    null
  );
}

function isMissingRelation(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /could not find the table|does not exist|schema cache/i.test(message)
  );
}

function rememberUser(id: string, username?: string | null, callSign?: string) {
  if (callSign) callSigns.set(id, callSign);
  if (username) usernames.set(id, username);
}

function labelOf(id: string | null | undefined) {
  if (!id) return "an open seat";
  return callSigns.get(id) ?? usernames.get(id) ?? "a candidate";
}

function shuffle<T>(items: readonly T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = copy[index] as T;
    copy[index] = copy[swap] as T;
    copy[swap] = current;
  }
  return copy;
}

function matchesLabel(label: string, query: string) {
  const left = label.trim().toLowerCase();
  const right = query.trim().toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function rankByLabel<T>(items: readonly T[], query: string, labelFor: (item: T) => string) {
  const ranked = [...items];
  ranked.sort((left, right) => {
    const leftHit = matchesLabel(labelFor(left), query) ? 0 : 1;
    const rightHit = matchesLabel(labelFor(right), query) ? 0 : 1;
    return leftHit - rightHit;
  });
  return ranked;
}

async function insertRow(table: string, row: Record<string, unknown>) {
  const payload = { ...row };
  let lastMessage = `Could not insert into ${table}.`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await db().from(table).insert(payload).select("*").maybeSingle();
    if (!error && data) return data as Record<string, unknown>;
    lastMessage = error?.message ?? lastMessage;
    const column = missingColumn(lastMessage);
    if (!column || !(column in payload)) break;
    delete payload[column];
  }
  throw new Error(lastMessage);
}

async function upsertRow(table: string, row: Record<string, unknown>, onConflict: string) {
  const payload = { ...row };
  let lastMessage = `Could not upsert ${table}.`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await db()
      .from(table)
      .upsert(payload, { onConflict })
      .select("*")
      .maybeSingle();
    if (!error) return (data ?? null) as Record<string, unknown> | null;
    lastMessage = error.message;
    const column = missingColumn(lastMessage);
    if (!column || !(column in payload)) break;
    delete payload[column];
  }
  throw new Error(lastMessage);
}

async function readRows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingRelation(error)) return [] as T[];
    throw new Error(error.message);
  }
  return data ?? [];
}

function districtFor(persona: Persona) {
  return DISTRICTS[persona.district];
}

async function districtUuid(ocdId: string) {
  const direct = await db().from("districts").select("id").eq("ocd_id", ocdId).maybeSingle();
  if (!direct.error && direct.data?.id) return direct.data.id as string;
  if (direct.error && !isMissingRelation(direct.error) && !missingColumn(direct.error.message)) {
    throw new Error(direct.error.message);
  }

  const election = await db()
    .from("elections")
    .select("district_id")
    .eq("ocd_id", ocdId)
    .not("district_id", "is", null)
    .limit(1);
  if (election.error) {
    if (isMissingRelation(election.error) || missingColumn(election.error.message)) return null;
    throw new Error(election.error.message);
  }
  return (election.data?.[0]?.district_id as string | undefined) ?? null;
}

async function findAuthUserIdByEmail(email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const listed = await db().auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw new Error(listed.error.message);
    const match = listed.data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (listed.data.users.length < 200) return null;
  }
  return null;
}

async function ensureAuthUser(persona: Persona) {
  const userId = personaUserId(persona.slug);
  const email = `arena-sim+${persona.slug}@where2run.dev`;
  const existing = await db().auth.admin.getUserById(userId);
  if (existing.data.user) return { userId: existing.data.user.id, created: false };
  if (existing.error && !isMissingUser(existing.error)) {
    throw new Error(existing.error.message);
  }

  const created = await db().auth.admin.createUser({
    id: userId,
    email,
    password: process.env.SIM_AGENT_PASSWORD ?? "arena-sim-local-only",
    email_confirm: true,
    user_metadata: {
      full_name: persona.callSign,
      sim: true,
      persona: persona.callSign,
    },
  });

  if (!created.error && created.data.user) {
    return { userId: created.data.user.id, created: true };
  }

  if (created.error && isDuplicate(created.error)) {
    const found = await findAuthUserIdByEmail(email);
    if (found) return { userId: found, created: false };
  }

  throw new Error(created.error?.message ?? `Could not create ${persona.callSign}.`);
}

async function ensureCampaignTargets(userId: string, ocdIds: readonly string[]) {
  for (const ocdId of ocdIds) {
    const election = await db().from("elections").select("id").eq("ocd_id", ocdId).limit(1);
    if (election.error) {
      if (isMissingRelation(election.error) || missingColumn(election.error.message)) return;
      throw new Error(election.error.message);
    }
    const electionId = election.data?.[0]?.id as string | undefined;
    if (!electionId) continue;

    const existing = await db()
      .from("campaign_targets")
      .select("id")
      .eq("user_id", userId)
      .eq("election_id", electionId)
      .maybeSingle();
    if (existing.error) {
      if (isMissingRelation(existing.error)) return;
      throw new Error(existing.error.message);
    }
    if (existing.data) continue;

    try {
      await insertRow("campaign_targets", {
        user_id: userId,
        election_id: electionId,
        status: "exploring",
        is_locked: false,
        alignment_streak: 0,
        pledged_escrow: 0,
      });
    } catch (error) {
      if (isDuplicate(error as { message?: string; code?: string })) continue;
      throw error;
    }
  }
}

async function ensurePublicUser(userId: string, persona: Persona, districtId: string | null) {
  const district = districtFor(persona);
  const homeOcdIds = physicalBallot(persona);
  const matchedOcdIds = ideologicalBallot(persona);
  const existing = await db()
    .from("users")
    .select("id, verification_tier, username, matched_ocd_ids")
    .eq("id", userId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const username = `sim-${persona.slug}`;
  const shared = {
    ocd_identifiers: ocdIdsFor(district.ocdId),
    target_district_id: districtId,
    residency_state: stateFromOcd(district.ocdId),
    tier_2_verified: true,
    is_verified: true,
    home_ocd_ids: homeOcdIds,
  };

  const ideologyVector = formatVector(IDEOLOGY_CENTROID[ideologyOf(persona)], 10);

  if (!existing.data) {
    await insertRow("users", {
      id: userId,
      username,
      verification_tier: "voter_verified",
      elo_rating: persona.startingElo,
      ideology_vector: ideologyVector,
      stance_vector: formatVector(persona.lean, 6),
      matched_ocd_ids: matchedOcdIds,
      ...shared,
    });
    await ensureCampaignTargets(userId, matchedOcdIds);
    rememberUser(userId, username, persona.callSign);
    return;
  }

  const tier =
    existing.data.verification_tier === "candidate_verified" ? "candidate_verified" : "voter_verified";
  const existingMatched = asOcdList(existing.data.matched_ocd_ids);
  const nextMatched = existingMatched.length > 0 ? existingMatched : matchedOcdIds;
  const { error } = await db()
    .from("users")
    .update({
      ...shared,
      verification_tier: tier,
      ...(existingMatched.length > 0
        ? {}
        : { matched_ocd_ids: matchedOcdIds, ideology_vector: ideologyVector }),
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  await ensureCampaignTargets(userId, nextMatched);
  rememberUser(userId, (existing.data.username as string | null) ?? username, persona.callSign);
}

async function seedAgents(): Promise<SimAgent[]> {
  const agents: SimAgent[] = [];
  for (const persona of PERSONAS) {
    const authUser = await ensureAuthUser(persona);
    const districtId = await districtUuid(districtFor(persona).ocdId);
    await ensurePublicUser(authUser.userId, persona, districtId);
    if (!wallets.has(authUser.userId)) wallets.set(authUser.userId, startingWallet(persona.slug));
    agents.push({ userId: authUser.userId, persona });
    const ideology = ideologyOf(persona);
    console.log(
      `[Sim] ${authUser.created ? "Created" : "Ready"} ${persona.callSign} · ${ideology} · home ${physicalBallot(persona).join(", ")} · matched ${ideologicalBallot(persona).join(", ")}`,
    );
  }
  return agents;
}

function asDebate(
  row: Record<string, unknown>,
  electionOcd: Map<string, string | null>,
  districtOcd: Map<string, string | null>,
): DebateBrief {
  const electionId = (row.election_id as string | null) ?? null;
  const districtId = (row.district_id as string | null) ?? null;
  const ocdId =
    (electionId ? electionOcd.get(electionId) : null) ??
    (districtId ? districtOcd.get(districtId) : null) ??
    null;
  return {
    id: String(row.id),
    topic: String(row.topic ?? "Untitled floor"),
    status: String(row.status ?? ""),
    candidateAId: (row.candidate_a_id as string | null) ?? null,
    candidateBId: (row.candidate_b_id as string | null) ?? null,
    districtId,
    electionId,
    ocdId,
  };
}

function asQuestion(row: Record<string, unknown>, electionOcd: Map<string, string | null>): QuestionBrief {
  const electionId = String(row.election_id);
  const electionOcdId = electionOcd.get(electionId);
  const applicable = asOcdList(row.applicable_ocd_ids);
  return {
    id: String(row.id),
    prompt: String(row.prompt),
    axis: String(row.primary_axis),
    electionId,
    ocdIds: electionOcdId ? [...applicable, electionOcdId] : applicable,
  };
}

function asCampaignTarget(row: Record<string, unknown>, electionOcd: Map<string, string | null>): CampaignTargetBrief {
  const electionId = String(row.election_id);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    electionId,
    ocdId: electionOcd.get(electionId) ?? null,
    alignmentStreak: Number(row.alignment_streak ?? 0),
    isLocked: Boolean(row.is_locked),
    pledgedEscrow: Number(row.pledged_escrow ?? 0),
  };
}

async function loadArenaContext(userId: string, persona: Persona): Promise<ArenaContext> {
  const profileResult = await db()
    .from("users")
    .select(
      "elo_rating, verification_tier, target_district_id, stance_vector, username, home_ocd_ids, matched_ocd_ids",
    )
    .eq("id", userId)
    .maybeSingle();
  if (profileResult.error) throw new Error(profileResult.error.message);
  const profile = profileResult.data;
  const districtId = (profile?.target_district_id as string | null) ?? null;
  rememberUser(userId, profile?.username as string | undefined, persona.callSign);

  const homeOcdIds = asOcdList(profile?.home_ocd_ids);
  const matchedOcdIds = asOcdList(profile?.matched_ocd_ids);
  const resolvedHome = homeOcdIds.length > 0 ? homeOcdIds : physicalBallot(persona);
  const resolvedMatched = matchedOcdIds.length > 0 ? matchedOcdIds : ideologicalBallot(persona);
  const homeWanted = ocdSet(resolvedHome);
  const matchedWanted = ocdSet(resolvedMatched);

  const district = districtFor(persona);
  const [electionRows, districtRows] = await Promise.all([
    readRows<Record<string, unknown>>(db().from("elections").select("id, district_id, ocd_id")),
    readRows<Record<string, unknown>>(db().from("districts").select("id, ocd_id")),
  ]);
  const electionOcd = new Map<string, string | null>(
    electionRows.map((row) => [String(row.id), (row.ocd_id as string | null) ?? null]),
  );
  const districtOcd = new Map<string, string | null>(
    districtRows.map((row) => [String(row.id), (row.ocd_id as string | null) ?? null]),
  );
  const homeElection =
    electionRows.find((row) => homeWanted.has(normalizeOcd(row.ocd_id as string | null))) ??
    electionRows.find((row) => normalizeOcd(row.ocd_id as string | null) === normalizeOcd(district.ocdId));
  const resolvedElectionId = homeElection ? String(homeElection.id) : null;

  const [recentDebates, ownDebates] = await Promise.all([
    readRows<Record<string, unknown>>(
      db()
        .from("debates")
        .select("id, topic, status, candidate_a_id, candidate_b_id, district_id, election_id")
        .order("created_at", { ascending: false })
        .limit(40),
    ),
    readRows<Record<string, unknown>>(
      db()
        .from("debates")
        .select("id, topic, status, candidate_a_id, candidate_b_id, district_id, election_id")
        .or(`candidate_a_id.eq.${userId},candidate_b_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(12),
    ),
  ]);
  const debateById = new Map<string, Record<string, unknown>>();
  for (const row of [...recentDebates, ...ownDebates]) debateById.set(String(row.id), row);
  const debates = [...debateById.values()].map((row) => asDebate(row, electionOcd, districtOcd));

  const [questions, stances, coalitionRows, eloRows, comments, argumentRows, votes, ownTargets, lockedRows] =
    await Promise.all([
      readRows<Record<string, unknown>>(
        db()
          .from("election_questions")
          .select("id, prompt, primary_axis, election_id, applicable_ocd_ids")
          .order("information_gain_score", { ascending: false })
          .limit(40),
      ),
      readRows<Record<string, unknown>>(db().from("user_stances").select("question_id").eq("user_id", userId)),
      readRows<Record<string, unknown>>(
        db().from("coalitions").select("id, name, founder_id").order("created_at", { ascending: false }).limit(8),
      ),
      readRows<Record<string, unknown>>(
        db()
          .from("users")
          .select("id, username, elo_rating, verification_tier")
          .order("elo_rating", { ascending: false })
          .limit(8),
      ),
      readRows<Record<string, unknown>>(
        db().from("comments").select("id, debate_id, author_id, body").order("created_at", { ascending: false }).limit(10),
      ),
      readRows<Record<string, unknown>>(
        db()
          .from("arguments")
          .select("id, debate_id, author_id, content")
          .order("created_at", { ascending: false })
          .limit(10),
      ),
      readRows<Record<string, unknown>>(db().from("votes").select("debate_id").eq("voter_id", userId)),
      readRows<Record<string, unknown>>(
        db()
          .from("campaign_targets")
          .select("id, user_id, election_id, alignment_streak, is_locked, pledged_escrow")
          .eq("user_id", userId),
      ),
      readRows<Record<string, unknown>>(
        db()
          .from("campaign_targets")
          .select("id, user_id, election_id, alignment_streak, is_locked, pledged_escrow")
          .eq("is_locked", true)
          .neq("user_id", userId)
          .limit(12),
      ),
    ]);

  const answered = new Set(stances.map((row) => String(row.question_id)));
  const votedDebateIds = new Set(votes.map((row) => String(row.debate_id)));
  for (const row of eloRows) rememberUser(String(row.id), row.username as string | null);

  const speech: SpeechBrief[] = [
    ...comments.map((row) => ({
      kind: "comment" as const,
      id: String(row.id),
      debateId: String(row.debate_id),
      authorId: String(row.author_id),
      body: String(row.body ?? ""),
    })),
    ...argumentRows.map((row) => ({
      kind: "argument" as const,
      id: String(row.id),
      debateId: String(row.debate_id),
      authorId: String(row.author_id),
      body: String(row.content ?? ""),
    })),
  ].filter((item) => item.authorId !== userId);

  const campaignTargets = ownTargets.map((row) => asCampaignTarget(row, electionOcd));
  const lockedTargets = lockedRows.map((row) => asCampaignTarget(row, electionOcd));

  await rememberIds([
    ...debates.flatMap((debate) => [debate.candidateAId, debate.candidateBId]),
    ...speech.map((item) => item.authorId),
    ...lockedTargets.map((target) => target.userId),
  ]);

  const openFloors = debates.filter(
    (debate) =>
      (debate.status === "waiting" || debate.status === "matching") &&
      !debate.candidateBId &&
      debate.candidateAId !== userId,
  );
  const activeDebates = debates.filter(
    (debate) =>
      debate.status === "active" && (debate.candidateAId === userId || debate.candidateBId === userId),
  );
  const votable = debates
    .filter(
      (debate) =>
        debate.candidateAId &&
        debate.candidateBId &&
        debate.candidateAId !== userId &&
        debate.candidateBId !== userId &&
        !votedDebateIds.has(debate.id) &&
        (debate.status === "voting" || debate.status === "completed" || debate.status === "active"),
    )
    .sort((left, right) => {
      const rank = (status: string) => (status === "completed" || status === "voting" ? 0 : 1);
      return rank(left.status) - rank(right.status);
    });
  const onHomeBallot = (debate: DebateBrief) => Boolean(debate.ocdId && homeWanted.has(normalizeOcd(debate.ocdId)));
  const homeDebates = debates.filter(onHomeBallot);
  const homeVotable = votable.filter(onHomeBallot);
  const unanswered = questions
    .filter((row) => !answered.has(String(row.id)))
    .map((row) => asQuestion(row, electionOcd));

  return {
    elo: Number(profile?.elo_rating ?? persona.startingElo),
    tier: String(profile?.verification_tier ?? "voter_verified"),
    ideology: ideologyOf(persona),
    districtId,
    electionId: resolvedElectionId,
    homeOcdIds: resolvedHome,
    matchedOcdIds: resolvedMatched,
    openFloors,
    activeDebates,
    votable,
    homeDebates,
    homeVotable,
    votedDebateIds,
    speech,
    highElo: eloRows
      .filter((row) => String(row.id) !== userId)
      .map((row) => ({
        id: String(row.id),
        elo: Number(row.elo_rating ?? 1200),
        tier: String(row.verification_tier ?? "unverified"),
      })),
    coalitions: coalitionRows.map((row) => ({ id: String(row.id), name: String(row.name) })),
    unanswered,
    redQuestions: unanswered.filter((question) => overlapsOcd(question.ocdIds, matchedWanted)),
    stance: parseVector(profile?.stance_vector, 6),
    campaignTargets,
    lockedTargets,
    walletDollars: walletOf(userId),
  };
}

async function rememberIds(ids: Array<string | null | undefined>) {
  const missing = [
    ...new Set(ids.filter((id): id is string => Boolean(id && !callSigns.has(id) && !usernames.has(id)))),
  ];
  if (missing.length === 0) return;
  const { data, error } = await db().from("users").select("id, username").in("id", missing);
  if (error || !data) return;
  for (const row of data) rememberUser(String(row.id), row.username as string | null);
}

function linesOf(items: string[], empty: string) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`;
}

function decisionInstruction(mode: DecisionMode, context: ArenaContext) {
  switch (mode) {
    case "red":
      return `Red Card grind. Answer one unanswered question filed in your matched_ocd_ids (${context.matchedOcdIds.join(", ")}). Use that question's axis. The score must match your ${context.ideology} ideology. This is how alignment_streak grows. Do not vote, comment, or pledge.`;
    case "blue":
      return `Blue Card engagement. Cast one spectator vote or leave one comment on a debate in your home_ocd_ids (${context.homeOcdIds.join(", ")}). Grassroots only. Stay on your ${context.ideology} ideology.`;
    case "pledge":
      return `You have $${context.walletDollars} in simulated funds, above the $${EXCESS_WALLET} excess line. Pledge to one other bot whose campaign target is_locked is true. Never pledge to yourself.`;
    case "floor":
      return context.redQuestions.length
        ? `Prefer ANSWER_STANCE on a matched_ocd_ids question when you can. Spectator votes and comments belong on home_ocd_ids debates.`
        : `Choose the action this persona would actually take. Spectator votes and comments belong on home_ocd_ids debates.`;
  }
}

function promptFor(userId: string, persona: Persona, context: ArenaContext, mode: DecisionMode) {
  const district = districtFor(persona);
  const lean = AXIS_IDS.map((axis, index) => `${axis} ${Math.round((persona.lean[index] ?? 0.5) * 100)}`).join(", ");
  const poles = AXIS_IDS.map((axis) => `${axis}: 1 ${AXIS_POLES[axis].low} → 100 ${AXIS_POLES[axis].high}`).join("\n");
  const canPledge = context.walletDollars > EXCESS_WALLET && context.lockedTargets.length > 0;
  const feasible = [
    context.redQuestions.length ? "ANSWER_STANCE" : null,
    "PROPOSE_DEBATE",
    "FORM_COALITION",
    "CLAIM_CANDIDACY",
    canPledge ? "PLEDGE_FUNDS" : null,
    context.openFloors.length || context.activeDebates.length ? "ENTER_DEBATE" : null,
    context.homeVotable.length ? "VOTE_SPECTATOR" : null,
    context.homeDebates.length ? "LEAVE_COMMENT" : null,
    context.speech.length ? "FLAG_USER" : null,
  ].filter(Boolean);
  const allowed =
    mode === "red"
      ? ["ANSWER_STANCE"]
      : mode === "blue"
        ? [context.homeVotable.length ? "VOTE_SPECTATOR" : null, context.homeDebates.length ? "LEAVE_COMMENT" : null].filter(Boolean)
        : mode === "pledge"
          ? ["PLEDGE_FUNDS"]
          : feasible;

  return `PERSONA
${persona.voice}
Call sign: ${persona.callSign}
Base ideology: ${context.ideology}. ${IDEOLOGY_VOICE[context.ideology]}
Home district: ${district.name}
Physical ballot (home_ocd_ids, Blue Cards): ${context.homeOcdIds.join(", ")}
Ideological ballot (matched_ocd_ids, Red Cards): ${context.matchedOcdIds.join(", ")}
Verification: ${context.tier}
ELO: ${context.elo}
Simulated funds: $${context.walletDollars}
Prior scores (1-100): ${lean}

AXES
${poles}

OPEN FLOORS
${linesOf(
  context.openFloors.slice(0, 5).map((debate) => `${labelOf(debate.candidateAId)} — ${clip(debate.topic, 160)}`),
  "None. Do not enter a debate.",
)}

YOUR ACTIVE DEBATES
${linesOf(
  context.activeDebates.slice(0, 4).map((debate) => {
    const opponent = debate.candidateAId === userId ? debate.candidateBId : debate.candidateAId;
    return `${labelOf(opponent)} — ${clip(debate.topic, 160)}`;
  }),
  "None.",
)}

BLUE CARD DEBATES (home_ocd_ids — spectator votes and comments only)
${linesOf(
  context.homeDebates.slice(0, 5).map(
    (debate) =>
      `${clip(debate.topic, 140)} | A ${labelOf(debate.candidateAId)} vs B ${labelOf(debate.candidateBId)} | ${debate.status} | ${debate.ocdId ?? "no ocd"}`,
  ),
  "None on the physical ballot. Do not vote or comment.",
)}

SPECTATOR BALLOTS ON THE PHYSICAL BALLOT
${linesOf(
  context.homeVotable.slice(0, 5).map(
    (debate) =>
      `${clip(debate.topic, 140)} | A ${labelOf(debate.candidateAId)} vs B ${labelOf(debate.candidateBId)} | ${debate.status}`,
  ),
  "None. Do not vote.",
)}

SPEECH YOU CAN FLAG
${linesOf(
  context.speech.slice(0, 5).map((item) => `${labelOf(item.authorId)} (${item.kind}): ${clip(item.body, 160)}`),
  "None. Do not flag.",
)}

HIGH-ELO CANDIDATES
${linesOf(
  context.highElo.slice(0, 5).map((candidate) => `${labelOf(candidate.id)} · ELO ${candidate.elo} · ${candidate.tier}`),
  "None.",
)}

COALITIONS
${linesOf(
  context.coalitions.slice(0, 5).map((coalition) => coalition.name),
  "None yet.",
)}

RED CARD QUESTIONS (matched_ocd_ids — answer these to build alignment_streak)
${linesOf(
  context.redQuestions.slice(0, 6).map((question) => `${question.axis}: ${clip(question.prompt, 160)}`),
  "No unanswered question on the ideological ballot.",
)}

YOUR CAMPAIGN TARGETS
${linesOf(
  context.campaignTargets
    .slice(0, 4)
    .map(
      (target) =>
        `${target.ocdId ?? target.electionId} · streak ${target.alignmentStreak} · ${target.isLocked ? "locked" : "unlocked"} · escrow $${target.pledgedEscrow}`,
    ),
  "No campaign target yet.",
)}

LOCKED CAMPAIGNS YOU CAN FUND
${linesOf(
  context.lockedTargets
    .slice(0, 5)
    .map((target) => `${labelOf(target.userId)} · ${target.ocdId ?? target.electionId} · escrow $${target.pledgedEscrow}`),
  "No other bot has a locked campaign.",
)}

DECISION
${decisionInstruction(mode, context)}
Allowed actions: ${allowed.join(", ")}.`;
}

function isAxis(value: string): value is AxisId {
  return (AXIS_IDS as readonly string[]).includes(value);
}

async function streakFor(userId: string, ocdId: string) {
  const elections = await db().from("elections").select("id").eq("ocd_id", ocdId);
  if (elections.error) return { electionIds: [] as string[], streak: 0 };
  const electionIds = (elections.data ?? []).map((row) => String(row.id));
  if (electionIds.length === 0) return { electionIds, streak: 0 };

  const targets = await db()
    .from("campaign_targets")
    .select("id, alignment_streak")
    .eq("user_id", userId)
    .in("election_id", electionIds);
  if (targets.error) return { electionIds, streak: 0 };
  const streak = Math.max(0, ...(targets.data ?? []).map((row) => Number(row.alignment_streak ?? 0)));
  return { electionIds, streak: Number.isFinite(streak) ? streak : 0, rows: targets.data ?? [] };
}

async function writeStreak(userId: string, ocdId: string, streak: number) {
  const current = await streakFor(userId, ocdId);
  for (const row of current.rows ?? []) {
    await db().from("campaign_targets").update({ alignment_streak: streak }).eq("id", row.id).eq("user_id", userId);
  }
}

async function advanceAlignment(userId: string, ocdId: string) {
  const before = await streakFor(userId, ocdId);
  const calibrated = await db().rpc("calibrate_district_alignment", {
    p_user_id: userId,
    p_district_id: ocdId,
  });

  if (!calibrated.error) {
    const after = await streakFor(userId, ocdId);
    if (after.streak > before.streak) return;
    const profile = await db().from("users").select("matched_ocd_ids").eq("id", userId).maybeSingle();
    const stillMatched = asOcdList(profile.data?.matched_ocd_ids).some((id) => normalizeOcd(id) === normalizeOcd(ocdId));
    if (!stillMatched) return;
  }

  await writeStreak(userId, ocdId, before.streak + 1);
}

async function answerStanceAction(userId: string, persona: Persona, context: ArenaContext, action: z.infer<typeof answerStance>) {
  const matched = ocdSet(context.matchedOcdIds);
  const redMatch =
    context.redQuestions.find((item) => item.axis === action.axis) ?? context.redQuestions[0] ?? null;
  const question = redMatch ?? context.unanswered.find((item) => item.axis === action.axis) ?? null;
  const axis = question && isAxis(question.axis) ? question.axis : action.axis;
  const score = Math.round(Math.min(100, Math.max(1, action.score)));
  const next = [...context.stance];
  const axisIndex = AXIS_IDS.indexOf(axis);
  if (axisIndex >= 0) next[axisIndex] = score / 100;
  const { error } = await db()
    .from("users")
    .update({ stance_vector: formatVector(next, 6) })
    .eq("id", userId);
  if (error && !missingColumn(error.message)) throw new Error(error.message);

  if (question) {
    const inserted = await db().from("user_stances").insert({
      user_id: userId,
      question_id: question.id,
      election_id: question.electionId,
      position_score: score / 100,
      position_label: clip(action.rationale, 180),
      primary_axis: axis,
    });
    if (inserted.error && !isDuplicate(inserted.error) && !isMissingRelation(inserted.error)) {
      throw new Error(inserted.error.message);
    }

    const ocdId = question.ocdIds.find((id) => matched.has(normalizeOcd(id))) ?? null;
    if (ocdId && !inserted.error) await advanceAlignment(userId, ocdId);
  }

  const district = question?.ocdIds.find((id) => matched.has(normalizeOcd(id))) ?? "open axis";
  return `[Sim] ${persona.callSign} scored ${axis} ${score} on ${district}`;
}

/**
 * Bank a question on a race and open a floor on it, with the caller in seat A.
 * The debate is tagged by election_id (whose ocd_id is the race) and district_id.
 */
async function openDebateFloor(input: {
  userId: string;
  question: string;
  axis: AxisId;
  level: "federal" | "state" | "local";
  electionId: string | null;
  districtId: string | null;
  ocdIds: string[];
}) {
  const question = clip(input.question, 280);
  let questionId: string | null = null;

  if (input.electionId) {
    const created = await db()
      .from("election_questions")
      .insert({
        election_id: input.electionId,
        author_id: input.userId,
        prompt: question,
        jurisdictional_level: input.level,
        primary_axis: input.axis,
        applicable_ocd_ids: input.ocdIds,
        information_gain_score: 1,
      })
      .select("id")
      .maybeSingle();

    if (created.error && isDuplicate(created.error)) {
      const existing = await db()
        .from("election_questions")
        .select("id")
        .eq("election_id", input.electionId)
        .eq("prompt", question)
        .maybeSingle();
      questionId = (existing.data?.id as string | undefined) ?? null;
    } else if (created.error && !isMissingRelation(created.error)) {
      throw new Error(created.error.message);
    } else {
      questionId = (created.data?.id as string | undefined) ?? null;
    }
  }

  const floor = {
    topic: question,
    district_id: input.districtId,
    election_id: input.electionId,
    election_question_id: questionId,
    candidate_a_id: input.userId,
    status: "waiting",
    current_round: 1,
  };
  try {
    return await insertRow("debates", floor);
  } catch (error) {
    if (!/debates_status_check|status/i.test(errorMessage(error))) throw error;
    return insertRow("debates", { ...floor, status: "matching" });
  }
}

async function proposeDebateAction(userId: string, persona: Persona, context: ArenaContext, action: z.infer<typeof proposeDebate>) {
  const district = districtFor(persona);
  const debate = await openDebateFloor({
    userId,
    question: action.question,
    axis: action.axis,
    level: action.jurisdictionalLevel,
    electionId: context.electionId,
    districtId: context.districtId,
    ocdIds: ocdIdsFor(district.ocdId),
  });

  return `[Sim] ${persona.callSign} proposed “${clip(String(debate.topic ?? action.question), 90)}”`;
}

async function fileArgument(debateId: string, userId: string, content: string, candidateColumn: "candidate_a_argument" | "candidate_b_argument") {
  const existing = await db()
    .from("arguments")
    .select("id")
    .eq("debate_id", debateId)
    .eq("author_id", userId)
    .eq("round_number", 1)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return;

  const argument = await db().from("arguments").insert({
    debate_id: debateId,
    author_id: userId,
    round_number: 1,
    content,
  });
  if (argument.error && !isDuplicate(argument.error)) throw new Error(argument.error.message);

  const updated = await db().from("debates").update({ [candidateColumn]: content }).eq("id", debateId);
  if (updated.error && !missingColumn(updated.error.message)) throw new Error(updated.error.message);
}

async function composeIdeologySpeech(persona: Persona, kind: "argument" | "comment", topic: string) {
  const ideology = ideologyOf(persona);
  const max = kind === "comment" ? 500 : 1500;
  const min = kind === "comment" ? 12 : 24;
  const { object } = await generateObject({
    model: speechModel(),
    schema: z.object({
      text: z.string().min(min).max(max),
    }),
    schemaName: kind === "comment" ? "DebateComment" : "DebateArgument",
    schemaDescription:
      kind === "comment"
        ? "One public comment on a home-district debate, aligned to the voter's base ideology."
        : "One debate argument aligned to the speaker's base ideology.",
    system: `You write as this voter. Base ideology: ${ideology}. ${IDEOLOGY_VOICE[ideology]} Voice: ${persona.voice} Stay strictly on that ideology. Do not mention being a simulation or an AI.`,
    prompt:
      kind === "comment"
        ? `Write a short public comment on this home-district debate:\n${topic}`
        : `Write a debate argument for this floor:\n${topic}`,
    temperature: 0.8,
  });
  return clip(object.text, max);
}

async function enterDebateAction(userId: string, persona: Persona, context: ArenaContext, action: z.infer<typeof enterDebate>) {
  const floors = rankByLabel(context.openFloors, action.opponentLabel, (debate) => labelOf(debate.candidateAId));
  const topic =
    floors[0]?.topic ??
    context.activeDebates[0]?.topic ??
    action.opponentLabel;
  const content = await composeIdeologySpeech(
    persona,
    "argument",
    `Topic: ${topic}\nOpponent: ${action.opponentLabel}`,
  );

  for (const floor of floors) {
    const claimed = await db()
      .from("debates")
      .update({
        candidate_b_id: userId,
        status: "active",
        candidate_b_argument: content,
      })
      .eq("id", floor.id)
      .is("candidate_b_id", null)
      .neq("candidate_a_id", userId)
      .select("id, candidate_a_id")
      .maybeSingle();
    if (claimed.error) throw new Error(claimed.error.message);
    if (!claimed.data) continue;
    try {
      await fileArgument(floor.id, userId, content, "candidate_b_argument");
    } catch (error) {
      console.error(
        `[Sim] ${persona.callSign} took the floor, but the argument did not file: ${errorMessage(error)}`,
      );
    }
    return `[Sim] ${persona.callSign} entered debate against ${labelOf(claimed.data.candidate_a_id as string)}`;
  }

  const active = rankByLabel(context.activeDebates, action.opponentLabel, (debate) => {
    const opponentId = debate.candidateAId === userId ? debate.candidateBId : debate.candidateAId;
    return labelOf(opponentId);
  });
  const mine = active[0];
  if (!mine) return `[Sim] ${persona.callSign} looked for an open floor and found none.`;

  const column = mine.candidateAId === userId ? "candidate_a_argument" : "candidate_b_argument";
  await fileArgument(mine.id, userId, content, column);
  const opponentId = mine.candidateAId === userId ? mine.candidateBId : mine.candidateAId;
  return `[Sim] ${persona.callSign} countered ${labelOf(opponentId)}`;
}

async function voteSpectatorAction(userId: string, persona: Persona, context: ArenaContext, action: z.infer<typeof voteSpectator>) {
  const ballots = rankByLabel(context.homeVotable, action.debateTopic, (debate) => debate.topic);
  const debate = ballots[0];
  if (!debate?.candidateAId || !debate.candidateBId) {
    return `[Sim] ${persona.callSign} found no home-district debate to judge.`;
  }
  const winnerId = action.side === "a" ? debate.candidateAId : debate.candidateBId;
  const { error } = await db().from("votes").insert({
    debate_id: debate.id,
    voter_id: userId,
    candidate_id: winnerId,
  });
  if (error && !isDuplicate(error)) throw new Error(error.message);
  if (error && isDuplicate(error)) return `[Sim] ${persona.callSign} had already voted on that floor.`;
  return `[Sim] ${persona.callSign} voted for ${labelOf(winnerId)} on ${debate.ocdId ?? "home ballot"}`;
}

async function leaveCommentAction(userId: string, persona: Persona, context: ArenaContext, action: z.infer<typeof leaveComment>) {
  const debates = rankByLabel(context.homeDebates, action.debateTopic, (debate) => debate.topic);
  const debate = debates[0];
  if (!debate) return `[Sim] ${persona.callSign} found no home-district debate to comment on.`;

  const existing = await db()
    .from("comments")
    .select("id")
    .eq("debate_id", debate.id)
    .eq("author_id", userId)
    .limit(1);
  if (existing.error && !isMissingRelation(existing.error)) throw new Error(existing.error.message);
  if (existing.data && existing.data.length > 0) {
    return `[Sim] ${persona.callSign} had already commented on that home debate.`;
  }

  const body = await composeIdeologySpeech(persona, "comment", debate.topic);
  const inserted = await db().from("comments").insert({
    debate_id: debate.id,
    author_id: userId,
    body,
    ai_stance_score: null,
  });
  if (inserted.error && !isDuplicate(inserted.error)) throw new Error(inserted.error.message);
  return `[Sim] ${persona.callSign} commented on ${clip(debate.topic, 80)}`;
}

function juryKind(targetKind: "argument" | "debate", reason: ReportReason) {
  if (reason === "abandoned") return "abandoned_debate";
  if (reason === "off_platform" || reason === "other") return null;
  if (targetKind === "debate" || targetKind === "argument") return "bad_faith_argument";
  return null;
}

async function fileReport(input: {
  reporterId: string;
  targetKind: "argument" | "debate";
  debateId: string;
  reason: ReportReason;
  argumentId?: string | null;
  note: string;
}) {
  const { data: report, error } = await db()
    .from("community_reports")
    .insert({
      reporter_id: input.reporterId,
      target_kind: input.targetKind,
      debate_id: input.debateId,
      reason: input.reason,
      argument_id: input.targetKind === "argument" ? input.argumentId : null,
      vote_id: null,
      note: clip(input.note, 500),
      status: "open",
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!report?.id) throw new Error("Could not file that report.");

  const kind = juryKind(input.targetKind, input.reason);
  if (!kind) return;

  const opened = await db()
    .from("arbitration_cases")
    .insert({
      debate_id: input.debateId,
      report_id: report.id,
      kind,
      status: "open",
      holds_elo: true,
    })
    .select("id")
    .maybeSingle();

  if (opened.error && !isDuplicate(opened.error)) throw new Error(opened.error.message);
  await db().from("community_reports").update({ status: "queued" }).eq("id", report.id);
}

async function flagUserAction(userId: string, persona: Persona, context: ArenaContext, action: z.infer<typeof flagUser>) {
  const targets = rankByLabel(context.speech, action.targetLabel, (item) => labelOf(item.authorId));
  if (targets.length === 0) return `[Sim] ${persona.callSign} found no comment to flag.`;

  for (const target of targets) {
    try {
      await fileReport({
        reporterId: userId,
        targetKind: target.kind === "argument" ? "argument" : "debate",
        debateId: target.debateId,
        reason: action.reason,
        argumentId: target.kind === "argument" ? target.id : null,
        note: target.kind === "comment" ? `Comment ${target.id}: ${action.note}` : action.note,
      });
      const kind = target.kind === "comment" ? "comment" : "argument";
      return `[Sim] ${persona.callSign} flagged ${labelOf(target.authorId)}'s ${kind}`;
    } catch (error) {
      if (isDuplicate(error as { message?: string; code?: string })) continue;
      throw error;
    }
  }

  return `[Sim] ${persona.callSign} had already reported that speech.`;
}

async function formCoalitionAction(userId: string, persona: Persona, action: z.infer<typeof formCoalition>) {
  const name = clip(action.name, 80);
  const charter = clip(action.charter, 600);
  if (name.length < 2 || charter.length < 20) {
    return `[Sim] ${persona.callSign} drafted a coalition charter that was too thin to file.`;
  }

  const coalition = await insertRow("coalitions", {
    name,
    charter_statement: charter,
    founder_id: userId,
  });
  const coalitionId = String(coalition.id);
  try {
    await insertRow("coalition_members", {
      coalition_id: coalitionId,
      candidate_id: userId,
      status: "active",
    });
  } catch (error) {
    await db().from("coalitions").delete().eq("id", coalitionId);
    throw error;
  }
  return `[Sim] ${persona.callSign} chartered ${name}`;
}

async function pledgeFundsAction(userId: string, persona: Persona, context: ArenaContext, action: z.infer<typeof pledgeFunds>) {
  const wallet = walletOf(userId);
  if (wallet <= EXCESS_WALLET) {
    return `[Sim] ${persona.callSign} kept $${wallet}; that is not excess funds.`;
  }
  const ranked = rankByLabel(context.lockedTargets, action.candidateLabel, (target) => labelOf(target.userId));
  const target = ranked.find((row) => row.isLocked && row.userId !== userId);
  if (!target) return `[Sim] ${persona.callSign} found no locked campaign to fund.`;

  const amount = Math.round(Math.min(wallet - 1, Math.max(1, action.amountDollars)) * 100) / 100;
  if (amount < 1) return `[Sim] ${persona.callSign} had nothing left to pledge.`;

  const current = await db()
    .from("campaign_targets")
    .select("id, user_id, pledged_escrow, is_locked")
    .eq("id", target.id)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const row = current.data as {
    id: string;
    user_id: string;
    pledged_escrow: number | string | null;
    is_locked: boolean | null;
  } | null;
  if (!row?.is_locked) return `[Sim] ${persona.callSign} found that campaign is not open for pledges.`;
  if (row.user_id === userId) return `[Sim] ${persona.callSign} cannot pledge to their own campaign.`;

  const pledgedEscrow = Math.round((Number(row.pledged_escrow ?? 0) + amount) * 100) / 100;
  const updated = await db().from("campaign_targets").update({ pledged_escrow: pledgedEscrow }).eq("id", row.id);
  if (updated.error) throw new Error(updated.error.message);

  wallets.set(userId, Math.round((wallet - amount) * 100) / 100);
  return `[Sim] ${persona.callSign} pledged $${amount} to ${labelOf(row.user_id)} (escrow $${pledgedEscrow})`;
}

/**
 * Service-role execution of lockCampaignTarget (app/actions/campaign/lock-target.ts).
 * That server action reads the caller from Next.js cookies, which this process
 * does not have. The write matches the action: is_locked = true once
 * alignment_streak is at least 10.
 */
async function lockCampaignTargetAction(userId: string, persona: Persona, ocdId: string) {
  const districtId = ocdId.trim();
  if (!districtId) return `[Sim] ${persona.callSign} had no district to lock.`;

  const elections = await db().from("elections").select("id, ocd_id");
  if (elections.error) throw new Error(elections.error.message);
  const wanted = normalizeOcd(districtId);
  const electionIds = ((elections.data ?? []) as { id: string; ocd_id?: string | null }[])
    .filter((row) => normalizeOcd(row.ocd_id) === wanted)
    .map((row) => row.id);
  if (electionIds.length === 0) {
    return `[Sim] ${persona.callSign} found no election filed for ${districtId}.`;
  }

  const targets = await db()
    .from("campaign_targets")
    .select("id, alignment_streak, is_locked")
    .eq("user_id", userId)
    .in("election_id", electionIds);
  if (targets.error) throw new Error(targets.error.message);

  const ready = ((targets.data ?? []) as { id: string; alignment_streak: number | null; is_locked: boolean | null }[])
    .filter((row) => (row.alignment_streak ?? 0) >= UNLOCK_STREAK && !row.is_locked);
  if (ready.length === 0) {
    return `[Sim] ${persona.callSign} is not ready to lock ${districtId}.`;
  }

  const updated = await db()
    .from("campaign_targets")
    .update({ is_locked: true })
    .in(
      "id",
      ready.map((row) => row.id),
    );
  if (updated.error) throw new Error(updated.error.message);
  return `[Sim] ${persona.callSign} locked ${districtId} after a ${UNLOCK_STREAK}+ alignment streak`;
}

async function claimCandidacyAction(userId: string, persona: Persona, action: z.infer<typeof claimCandidacy>) {
  const district = districtFor(persona);
  const ballotName = clip(action.ballotName, 120);
  const reference = `SIM-${persona.slug}`.replace(/[^A-Za-z0-9 ._-]/g, "").slice(0, 64);
  await upsertRow(
    "tier3_verifications",
    {
      user_id: userId,
      claim_status: "submitted",
      government_id_reference: reference,
      government_id_status: "submitted",
      ballot_name: ballotName,
      ballot_ocd_id: district.ocdId,
      ballot_source: "arena-sim",
      ballot_cross_reference: {
        source: "arena-sim",
        mock: true,
        office: clip(action.officeSought, 80),
      },
      submitted_at: new Date().toISOString(),
    },
    "user_id",
  );

  const userUpdate = await db()
    .from("users")
    .update({ verification_tier: "candidate_verified", is_verified: true })
    .eq("id", userId);
  if (userUpdate.error) throw new Error(userUpdate.error.message);

  await upsertRow(
    "candidates",
    {
      id: userId,
      display_name: ballotName,
      office_sought: clip(action.officeSought, 80),
      bio: clip(action.statement, 500),
      residency_state: stateFromOcd(district.ocdId),
      ideology_vector: formatVector(persona.lean, 10),
      onboarding_completed: true,
      pac_agreement_accepted: true,
    },
    "id",
  );

  return `[Sim] ${persona.callSign} claimed candidacy for ${clip(action.officeSought, 60)}`;
}

async function dispatch(userId: string, persona: Persona, context: ArenaContext, action: AgentAction) {
  switch (action.action) {
    case "ANSWER_STANCE":
      return answerStanceAction(userId, persona, context, action);
    case "PROPOSE_DEBATE":
      return proposeDebateAction(userId, persona, context, action);
    case "ENTER_DEBATE":
      return enterDebateAction(userId, persona, context, action);
    case "VOTE_SPECTATOR":
      return voteSpectatorAction(userId, persona, context, action);
    case "LEAVE_COMMENT":
      return leaveCommentAction(userId, persona, context, action);
    case "FLAG_USER":
      return flagUserAction(userId, persona, context, action);
    case "FORM_COALITION":
      return formCoalitionAction(userId, persona, action);
    case "PLEDGE_FUNDS":
      return pledgeFundsAction(userId, persona, context, action);
    case "CLAIM_CANDIDACY":
      return claimCandidacyAction(userId, persona, action);
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

function chooseMode(context: ArenaContext): DecisionMode {
  const canPledge = context.walletDollars > EXCESS_WALLET && context.lockedTargets.length > 0;
  const options: DecisionMode[] = [];
  if (context.redQuestions.length > 0) options.push("red", "red", "red");
  if (context.homeDebates.length > 0) options.push("blue");
  if (canPledge) options.push("pledge");
  options.push("floor");
  return options[Math.floor(Math.random() * options.length)] ?? "floor";
}

function readyToLock(context: ArenaContext) {
  return (
    context.campaignTargets
      .filter((row) => row.alignmentStreak >= UNLOCK_STREAK && !row.isLocked && row.ocdId)
      .sort((left, right) => right.alignmentStreak - left.alignmentStreak)[0] ?? null
  );
}

async function generateAction(
  userId: string,
  persona: Persona,
  context: ArenaContext,
  mode: DecisionMode,
): Promise<AgentAction> {
  const system = `You are this persona. Base ideology: ${context.ideology}. ${IDEOLOGY_VOICE[context.ideology]} Look at the active arena. Choose ONE action from the schema and generate only the content that action requires. Stay in character and on that ideology. Do not mention being a simulation.`;
  const prompt = promptFor(userId, persona, context, mode);
  const temperature = 0.9;

  switch (mode) {
    case "red": {
      const { object } = await generateObject({
        model: simulationModel(),
        schema: answerStance,
        schemaName: "RedCardStance",
        schemaDescription: "Answer one matched-district question to build alignment_streak.",
        system,
        prompt,
        temperature,
      });
      return object;
    }
    case "blue": {
      const schema = context.homeVotable.length
        ? z.discriminatedUnion("action", [voteSpectator, leaveComment])
        : leaveComment;
      const { object } = await generateObject({
        model: simulationModel(),
        schema,
        schemaName: "BlueCardEngagement",
        schemaDescription: "One spectator vote or comment on a home-district debate.",
        system,
        prompt,
        temperature,
      });
      return object;
    }
    case "pledge": {
      const { object } = await generateObject({
        model: simulationModel(),
        schema: pledgeFunds,
        schemaName: "PledgeLockedCampaign",
        schemaDescription: "Pledge simulated funds to another bot whose campaign target is locked.",
        system,
        prompt,
        temperature,
      });
      return object;
    }
    case "floor": {
      const { object } = await generateObject({
        model: simulationModel(),
        schema: agentActionSchema,
        schemaName: "ArenaAgentAction",
        schemaDescription: "One arena action. Exactly one variant. Generate only the content that action requires.",
        system,
        prompt,
        temperature,
      });
      return object;
    }
  }
}

export async function tickAgent(userId: string, persona: Persona) {
  const context = await loadArenaContext(userId, persona);
  const lock = readyToLock(context);
  if (lock?.ocdId) {
    const line = await lockCampaignTargetAction(userId, persona, lock.ocdId);
    console.log(line);
    return { action: "LOCK_CAMPAIGN_TARGET" as const, ocdId: lock.ocdId };
  }

  const mode = chooseMode(context);
  const object = await generateAction(userId, persona, context, mode);
  const line = await dispatch(userId, persona, context, object);
  console.log(line);
  return object;
}

async function chaosTick(agents: SimAgent[]) {
  const count = Math.min(agents.length, 3 + Math.floor(Math.random() * 3));
  const picked = shuffle(agents).slice(0, count);
  console.log(`[Sim] Tick · ${picked.map((agent) => agent.persona.callSign).join(", ")}`);
  await Promise.all(
    picked.map(async (agent) => {
      try {
        await tickAgent(agent.userId, agent.persona);
      } catch (error) {
        console.error(`[Sim] ${agent.persona.callSign} failed: ${errorMessage(error)}`);
      }
    }),
  );
}

const TX37_OCD_ID = DISTRICTS.tx37.ocdId;

/** Questions the coverage step rotates through. One is consumed per run. */
const TX37_TOPICS: { question: string; axis: AxisId; level: "federal" | "state" | "local" }[] = [
  {
    question: "Should Congress fund a public health option for Texas's 37th Congressional District?",
    axis: "healthcare",
    level: "federal",
  },
  {
    question: "Should federal grants favor transit and housing along I-35 over highway widening in Austin?",
    axis: "economy",
    level: "federal",
  },
  {
    question: "Should Congress expand asylum processing capacity and legal pathways for Central Texas?",
    axis: "immigration",
    level: "federal",
  },
  {
    question: "Should federal policing grants require community responders for mental-health calls?",
    axis: "safety",
    level: "federal",
  },
  {
    question: "Should Congress preempt state grid rules to speed clean-energy transmission through Travis County?",
    axis: "climate",
    level: "federal",
  },
  {
    question: "Should Congress codify a federal right to contraception?",
    axis: "social",
    level: "federal",
  },
];

/** Used only when OPENAI_API_KEY is missing, so coverage can still be verified offline. */
const SCRIPTED_SPEECH: Record<BaseIdeology, { opening: string; response: string }> = {
  progressive: {
    opening:
      "This is a public-investment question, and TX-37 families pay the price when we treat it as optional. A funded federal program lowers costs, protects workers, and gives the district something durable. Waiting on the market has not delivered it.",
    response:
      "My opponent describes the cost of acting and skips the cost of not acting. Rents, premiums, and commute times in this district keep climbing. A public program is the only option on the table that grows with the need.",
  },
  conservative: {
    opening:
      "Washington should not be writing this check. Every federal mandate here lands on taxpayers in TX-37 and on the small businesses that already carry the load. Keep the decision local, keep the rules light, and let people keep more of what they earn.",
    response:
      "That proposal sounds generous until the bill arrives. Federal programs grow, cost more than promised, and crowd out what communities do better on their own. I would rather cut the friction than add another agency.",
  },
  centrist: {
    opening:
      "Both sides have a real point here, and TX-37 deserves an answer that survives an election cycle. Start with a scoped pilot, measure what it costs and what it delivers, and only then decide how far to go.",
    response:
      "Neither script fits this district. I would take the strongest piece of each plan, fund it in stages, and put a sunset date on it so voters can judge the result instead of the slogan.",
  },
};

async function coverageSpeech(persona: Persona, topic: string, role: "opening" | "response") {
  if (process.env.OPENAI_API_KEY) {
    return composeIdeologySpeech(persona, "argument", `Topic: ${topic}\nRole: ${role} statement`);
  }
  return SCRIPTED_SPEECH[ideologyOf(persona)][role];
}

async function tx37Debates(electionId: string) {
  return readRows<Record<string, unknown>>(
    db()
      .from("debates")
      .select("id, topic, status, candidate_a_id, candidate_b_id")
      .eq("election_id", electionId),
  );
}

/**
 * Guarantee that TX-37 has live sim traffic:
 *   1. at least two bots list cd:37 on their home ballot,
 *   2. one bot opens a floor tagged to the TX-37 election and a second bot with
 *      a different ideology answers it, so the debate goes active,
 *   3. one more floor is left open with a waiting challenger, so the Red Card
 *      "Take the Floor" path has real data.
 * Each run consumes one unused topic, so repeated runs cannot pile up debates.
 */
async function ensureTx37Coverage(agents: SimAgent[]) {
  const wanted = normalizeOcd(TX37_OCD_ID);
  const homes = await readRows<Record<string, unknown>>(
    db()
      .from("users")
      .select("id, home_ocd_ids")
      .in(
        "id",
        agents.map((agent) => agent.userId),
      ),
  );
  const homeById = new Map(homes.map((row) => [String(row.id), asOcdList(row.home_ocd_ids)]));
  const residents = agents.filter((agent) =>
    (homeById.get(agent.userId) ?? []).some((id) => normalizeOcd(id) === wanted),
  );

  console.log(
    `[Sim] TX-37 residents (${residents.length}): ${residents.map((agent) => `${agent.persona.callSign} [${ideologyOf(agent.persona)}]`).join(", ") || "none"}`,
  );
  if (residents.length < 2) {
    throw new Error(`Need at least 2 bots with ${TX37_OCD_ID} in home_ocd_ids, found ${residents.length}.`);
  }

  const electionResult = await db()
    .from("elections")
    .select("id, district_id")
    .eq("ocd_id", TX37_OCD_ID)
    .limit(1);
  if (electionResult.error) throw new Error(electionResult.error.message);
  const election = electionResult.data?.[0] as { id: string; district_id: string | null } | undefined;
  if (!election) {
    console.warn(`[Sim] No election filed for ${TX37_OCD_ID}. Run supabase db reset to load the seed.`);
    return;
  }
  const districtId = election.district_id ?? (await districtUuid(TX37_OCD_ID));

  const existing = await tx37Debates(election.id);
  const usedTopics = new Set(existing.map((row) => String(row.topic ?? "")));
  const unused = TX37_TOPICS.filter((entry) => !usedTopics.has(clip(entry.question, 280)));

  const primary = unused[0];
  if (!primary) {
    console.log("[Sim] TX-37 coverage: every rotation topic already has a debate. Nothing new to open.");
    return;
  }

  const pool = shuffle(residents);
  const first = pool[0] as SimAgent;
  const second =
    pool.find((agent) => agent.userId !== first.userId && ideologyOf(agent.persona) !== ideologyOf(first.persona)) ??
    (pool.find((agent) => agent.userId !== first.userId) as SimAgent);

  const debate = await openDebateFloor({
    userId: first.userId,
    question: primary.question,
    axis: primary.axis,
    level: primary.level,
    electionId: election.id,
    districtId,
    ocdIds: ocdIdsFor(TX37_OCD_ID),
  });
  const debateId = String(debate.id);
  const topic = String(debate.topic ?? primary.question);

  await fileArgument(
    debateId,
    first.userId,
    clip(await coverageSpeech(first.persona, topic, "opening"), 1500),
    "candidate_a_argument",
  );
  console.log(`[Sim] ${first.persona.callSign} opened a TX-37 floor: “${clip(topic, 90)}”`);

  const reply = clip(await coverageSpeech(second.persona, topic, "response"), 1500);
  const claimed = await db()
    .from("debates")
    .update({ candidate_b_id: second.userId, status: "active", candidate_b_argument: reply })
    .eq("id", debateId)
    .is("candidate_b_id", null)
    .neq("candidate_a_id", second.userId)
    .select("id")
    .maybeSingle();
  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data) throw new Error(`Could not seat ${second.persona.callSign} on TX-37 debate ${debateId}.`);
  await fileArgument(debateId, second.userId, reply, "candidate_b_argument");
  console.log(
    `[Sim] ${second.persona.callSign} [${ideologyOf(second.persona)}] answered ${first.persona.callSign} [${ideologyOf(first.persona)}] on TX-37`,
  );

  const stillOpen = existing.some(
    (row) =>
      row.candidate_a_id &&
      !row.candidate_b_id &&
      (row.status === "waiting" || row.status === "matching"),
  );
  const third = pool.find((agent) => agent.userId !== first.userId && agent.userId !== second.userId);
  const extra = unused[1];
  if (!stillOpen && third && extra) {
    const floor = await openDebateFloor({
      userId: third.userId,
      question: extra.question,
      axis: extra.axis,
      level: extra.level,
      electionId: election.id,
      districtId,
      ocdIds: ocdIdsFor(TX37_OCD_ID),
    });
    await fileArgument(
      String(floor.id),
      third.userId,
      clip(await coverageSpeech(third.persona, String(floor.topic ?? extra.question), "opening"), 1500),
      "candidate_a_argument",
    );
    console.log(`[Sim] ${third.persona.callSign} left a TX-37 floor open for a challenger: “${clip(extra.question, 90)}”`);
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (PERSONAS.length !== 20) {
    throw new Error(`Expected 20 personas, found ${PERSONAS.length}.`);
  }

  console.log("[Sim] Seeding arena agents.");
  const agents = await seedAgents();
  console.log(`[Sim] ${agents.length} agents ready.`);

  await ensureTx37Coverage(agents);
  if (process.argv.includes("--coverage-only")) return;

  simulationModel();

  const once = process.argv.includes("--once");
  await chaosTick(agents);
  if (once) return;

  let ticking = false;
  setInterval(() => {
    if (ticking) {
      console.log("[Sim] Previous tick still running.");
      return;
    }
    ticking = true;
    void chaosTick(agents).finally(() => {
      ticking = false;
    });
  }, TICK_MS);

  console.log("[Sim] Arena loop running. 3–5 agents every 10s. Ctrl+C to stop.");
}

function invokedDirectly() {
  return process.argv.some((arg) => /arena-sim\.[cm]?[jt]s$/.test(arg));
}

if (invokedDirectly()) {
  main().catch((error) => {
    console.error(`[Sim] ${errorMessage(error)}`);
    process.exit(1);
  });
}
