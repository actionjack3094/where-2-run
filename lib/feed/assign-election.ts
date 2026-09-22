import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { emptySixAxis, SIX_AXIS_IDS, type SixAxisVector } from "@/lib/ideology/six-axis";
import { clamp01 } from "@/lib/ideology/vector";
import { firstClaim } from "@/lib/feed/html";
import type { StanceAssignment } from "@/lib/feed/types";
import type { Election, FilingRequirements } from "@/types/database.types";

export type ElectionCatalogRow = Pick<
  Election,
  "id" | "slug" | "office_name" | "district_id"
> & {
  filing_requirements?: FilingRequirements | Record<string, unknown> | null;
};

const LOCAL_KEYS =
  /\b(zoning|capmetro|cap metro|parking|ordinance|city council|mayor|neighborhood|adu|project connect|codeNEXT|bus|transit|municipal|housing|landlord)\b/i;
const STATE_KEYS =
  /\b(legislature|governor|state senate|tea\b|comptroller|railroad commission|preemption|texas house)\b/i;
const FEDERAL_KEYS =
  /\b(capital gains|irs|congress|u\.s\. house|senate|federal tax|tariff|medicare|social security|supreme court|fec)\b/i;

const AXIS_KEYS: Record<(typeof SIX_AXIS_IDS)[number], RegExp> = {
  climate: /\b(climate|renewable|fossil|emissions|energy|drill|capmetro|transit|zoning)\b/i,
  healthcare: /\b(medicare|medicaid|health\s?care|hospital|insur|single-payer)\b/i,
  immigration: /\b(immigra|border|asylum|visa|ice|citizenship)\b/i,
  economy:
    /\b(tax|wage|union|capital gains|housing|parking|zoning|jobs|inflation|labor|irs)\b/i,
  social: /\b(abortion|lgbtq|civil rights?|religion|gender|speech)\b/i,
  safety: /\b(police|crime|safety|prosecutor|jail|fentanyl|patrol)\b/i,
};

const assignmentSchema = z.object({
  topic: z.string().min(1).max(280),
  keywords: z.array(z.string()).max(12),
  jurisdiction: z.enum(["local", "state", "federal"]),
  geography: z.array(z.string()).max(8),
  officeHint: z.string(),
  electionId: z.string().nullable(),
  climate: z.number().min(0).max(1),
  healthcare: z.number().min(0).max(1),
  immigration: z.number().min(0).max(1),
  economy: z.number().min(0).max(1),
  social: z.number().min(0).max(1),
  safety: z.number().min(0).max(1),
});

function filingLevel(requirements: ElectionCatalogRow["filing_requirements"]) {
  if (!requirements || typeof requirements !== "object") return "";
  const level = "level" in requirements ? requirements.level : "";
  return typeof level === "string" ? level.toLowerCase() : "";
}

function electionHaystack(row: ElectionCatalogRow) {
  const requirements = row.filing_requirements;
  const extra =
    requirements && typeof requirements === "object" ? JSON.stringify(requirements) : "";
  return `${row.office_name} ${row.slug} ${extra}`.toLowerCase();
}

export function inferJurisdiction(text: string): StanceAssignment["jurisdiction"] {
  if (FEDERAL_KEYS.test(text)) return "federal";
  if (STATE_KEYS.test(text)) return "state";
  if (LOCAL_KEYS.test(text)) return "local";
  return "local";
}

export function inferKeywords(text: string) {
  const matches = text.match(
    /\b(zoning|capmetro|cap metro|capital gains|parking|transit|housing|irs|congress|city council|ordinance)\b/gi,
  );
  return [...new Set((matches ?? []).map((entry) => entry.toLowerCase()))].slice(0, 8);
}

export function inferSixAxisFromText(text: string): SixAxisVector {
  const next = emptySixAxis();
  let hits = 0;

  for (let index = 0; index < SIX_AXIS_IDS.length; index += 1) {
    const axis = SIX_AXIS_IDS[index];
    const count = text.match(new RegExp(AXIS_KEYS[axis], "gi"))?.length ?? 0;
    if (count > 0) {
      next[index] = clamp01(0.55 + Math.min(count, 4) * 0.1);
      hits += 1;
    }
  }

  if (hits === 0) return next;
  return next;
}

export function scoreElection(
  row: ElectionCatalogRow,
  input: {
    jurisdiction: StanceAssignment["jurisdiction"];
    geography: string[];
    keywords: string[];
    userState?: string | null;
    preferredDistrictId?: string | null;
  },
) {
  const haystack = electionHaystack(row);
  const level = filingLevel(row.filing_requirements);
  let score = 0;

  if (input.preferredDistrictId && row.district_id === input.preferredDistrictId) score += 5;
  if (input.jurisdiction === "local" && (/council|mayor|city|school|local/.test(haystack) || level === "local")) {
    score += 4;
  }
  if (
    input.jurisdiction === "federal" &&
    (/congress|house|senate|u\.s|federal/.test(haystack) || level === "federal")
  ) {
    score += 4;
  }
  if (
    input.jurisdiction === "state" &&
    (/governor|legislature|state/.test(haystack) || level === "state")
  ) {
    score += 4;
  }

  for (const geo of input.geography) {
    const needle = geo.trim().toLowerCase();
    if (needle && haystack.includes(needle)) score += 3;
  }
  for (const keyword of input.keywords) {
    const needle = keyword.trim().toLowerCase();
    if (needle && haystack.includes(needle)) score += 2;
  }
  if (input.userState && haystack.includes(input.userState.trim().toLowerCase())) {
    score += 1;
  }

  return score;
}

export function pickElectionId(
  elections: ElectionCatalogRow[],
  input: {
    preferredId?: string | null;
    jurisdiction: StanceAssignment["jurisdiction"];
    geography: string[];
    keywords: string[];
    userState?: string | null;
    preferredDistrictId?: string | null;
  },
) {
  if (input.preferredId && elections.some((row) => row.id === input.preferredId)) {
    return input.preferredId;
  }

  let best: ElectionCatalogRow | null = null;
  let bestScore = -1;
  for (const row of elections) {
    const score = scoreElection(row, input);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  if (!best || bestScore <= 0) {
    if (input.preferredDistrictId) {
      const districtMatch = elections.find((row) => row.district_id === input.preferredDistrictId);
      if (districtMatch) return districtMatch.id;
    }
    return elections[0]?.id ?? null;
  }

  return best.id;
}

function catalogPrompt(elections: ElectionCatalogRow[]) {
  return elections
    .slice(0, 40)
    .map((row) => {
      const level = filingLevel(row.filing_requirements) || "unknown";
      return `- ${row.id} | ${row.office_name} | ${row.slug} | ${level}`;
    })
    .join("\n");
}

function hasProviderKey() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY);
}

function heuristicAssignment(
  text: string,
  elections: ElectionCatalogRow[],
  context: {
    userState?: string | null;
    preferredDistrictId?: string | null;
  },
): StanceAssignment {
  const jurisdiction = inferJurisdiction(text);
  const keywords = inferKeywords(text);
  const geography: string[] = [];
  if (/\baustin\b/i.test(text) || /\bcapmetro\b/i.test(text)) geography.push("Austin");
  if (context.userState) geography.push(context.userState);

  return {
    topic: firstClaim(text, "District policy stance"),
    keywords,
    jurisdiction,
    geography,
    officeHint:
      jurisdiction === "federal"
        ? "U.S. House"
        : jurisdiction === "state"
          ? "State Legislature"
          : "City Council",
    electionId: pickElectionId(elections, {
      jurisdiction,
      geography,
      keywords,
      userState: context.userState,
      preferredDistrictId: context.preferredDistrictId,
    }),
    vector: inferSixAxisFromText(text),
  };
}

export async function assignStanceToElection(
  text: string,
  elections: ElectionCatalogRow[],
  context: {
    userState?: string | null;
    preferredDistrictId?: string | null;
  } = {},
): Promise<StanceAssignment> {
  const fallback = heuristicAssignment(text, elections, context);
  if (!hasProviderKey() || elections.length === 0) return fallback;

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: assignmentSchema,
      schemaName: "StanceElectionAssignment",
      schemaDescription:
        "Map a civic stance to geographic keywords, jurisdiction, a 6-axis ideology vector, and an election_id from the catalog.",
      system:
        "You assign WHERE 2 RUN stances to ballot races. Extract geographic and jurisdictional keywords. Map local land-use, transit, zoning, CapMetro, parking, and city ordinances to a City Council election. Map capital gains, IRS, federal tax, Congress, and Medicare to a federal congressional race. Map governor/legislature items to a state race. Return electionId from the catalog only. Score each 6-axis value in [0, 1] from the author's position (1 = progressive pole).",
      prompt: `STANCE
${text}

ELECTION CATALOG
${catalogPrompt(elections)}

Viewer state: ${context.userState ?? "unknown"}
Preferred district: ${context.preferredDistrictId ?? "none"}

Return the debate topic, keywords, jurisdiction, geography, officeHint, the best electionId, and 6-axis scores.`,
      temperature: 0.2,
    });

    const vector: SixAxisVector = [
      clamp01(object.climate),
      clamp01(object.healthcare),
      clamp01(object.immigration),
      clamp01(object.economy),
      clamp01(object.social),
      clamp01(object.safety),
    ];

    return {
      topic: object.topic.trim() || fallback.topic,
      keywords: object.keywords.length ? object.keywords : fallback.keywords,
      jurisdiction: object.jurisdiction,
      geography: object.geography.length ? object.geography : fallback.geography,
      officeHint: object.officeHint.trim() || fallback.officeHint,
      electionId: pickElectionId(elections, {
        preferredId: object.electionId,
        jurisdiction: object.jurisdiction,
        geography: object.geography,
        keywords: object.keywords,
        userState: context.userState,
        preferredDistrictId: context.preferredDistrictId,
      }),
      vector,
    };
  } catch (error) {
    console.warn("Stance assignment: falling back to keyword mapping.", error);
    return fallback;
  }
}
