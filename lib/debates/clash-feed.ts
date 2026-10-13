import type { CandidateTierName, Party } from "@/lib/platform/scoring";

/** arena_debates id for the seeded Texas Senate Medicaid clash. */
export const TEXAS_MEDICAID_DEBATE_ID = "a4e4a001-0001-4000-8000-0000000000a1";

export type ClashSide = {
  id: string;
  name: string;
  avatarUrl: string | null;
  party: Party;
  tier: CandidateTierName;
  excerpt: string;
};

export type ClashCard = {
  id: string;
  question: string;
  officeTag: string;
  href: string;
  upvotes: number;
  resonance: number;
  questionCount: number;
  sideA: ClashSide;
  sideB: ClashSide;
};

/**
 * Seeded Lena Ortiz vs. Caleb Nguyen clash from supabase/seed.sql.
 * Used when that row is not in the live query so the feed still opens on it.
 */
export const TEXAS_MEDICAID_CLASH: ClashCard = {
  id: TEXAS_MEDICAID_DEBATE_ID,
  question: "Expand Medicaid and close the coverage gap",
  officeTag: "US Senate · TX",
  href: `/debates/${TEXAS_MEDICAID_DEBATE_ID}`,
  upvotes: 18,
  resonance: 0,
  questionCount: 1,
  sideA: {
    id: "a0a00001-0003-4000-8000-000000000003",
    name: "Lena Ortiz",
    avatarUrl: null,
    party: "democrat",
    tier: "declared_candidate",
    excerpt:
      "A public option alone still leaves people in the gap who never see a marketplace plan. Round two is the Medicaid expansion itself, with the public option as the bridge, not the substitute.",
  },
  sideB: {
    id: "a0a00001-0004-4000-8000-000000000004",
    name: "Caleb Nguyen",
    avatarUrl: null,
    party: "democrat",
    tier: "declared_candidate",
    excerpt:
      "Expand coverage, but do not open the full Medicaid rolls on day one. Start with a public option for people in the gap and a federal match that does not stick the state with the whole bill.",
  },
};

export function formatOfficeTag(office: string, state: string) {
  const cleaned = office
    .replace(/\bU\.S\./gi, "US")
    .replace(/\bUnited States\b/gi, "US")
    .trim();
  const place = state.trim();
  return place ? `${cleaned} · ${place}` : cleaned || "Primary";
}

/** First one or two sentences, capped so a card stays a skim. */
export function excerpt(text: string, sentences = 2) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const parts = trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  const chosen = (parts ?? [trimmed]).slice(0, sentences).join("").trim();
  if (chosen.length <= 280) return chosen;
  return `${chosen.slice(0, 277).trimEnd()}…`;
}

export function latestSideText(
  stance: string | null | undefined,
  rows: { authorId: string; round: number; content: string }[],
  authorId: string,
) {
  const latest = rows
    .filter((row) => row.authorId === authorId && row.content.trim())
    .sort((left, right) => right.round - left.round)[0];
  const text = excerpt(latest?.content ?? stance ?? "");
  return text || "No argument filed yet.";
}

function presentSide(live: ClashSide, seed: ClashSide): ClashSide {
  const named = Boolean(live.name && live.name !== "Contender");
  return {
    ...live,
    id: live.id || seed.id,
    name: named ? live.name : seed.name,
    party: live.party,
    tier: live.tier === "pundit" ? seed.tier : live.tier,
    excerpt: live.excerpt && live.excerpt !== "No argument filed yet." ? live.excerpt : seed.excerpt,
  };
}

/** Fill the seeded clash from seed.sql when a live row is missing names or counts. */
export function presentSeededClash(card: ClashCard): ClashCard {
  if (card.id !== TEXAS_MEDICAID_DEBATE_ID) return card;
  return {
    ...card,
    question: card.question.trim() || TEXAS_MEDICAID_CLASH.question,
    officeTag: /senate/i.test(card.officeTag) ? card.officeTag : TEXAS_MEDICAID_CLASH.officeTag,
    upvotes: Math.max(card.upvotes, TEXAS_MEDICAID_CLASH.upvotes),
    questionCount: Math.max(card.questionCount, TEXAS_MEDICAID_CLASH.questionCount),
    sideA: presentSide(card.sideA, TEXAS_MEDICAID_CLASH.sideA),
    sideB: presentSide(card.sideB, TEXAS_MEDICAID_CLASH.sideB),
  };
}

/** The Texas Senate Medicaid clash is always the first card. Live data wins over the mock. */
export function orderClashFeed(cards: ClashCard[]): ClashCard[] {
  const unique: ClashCard[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    unique.push(card);
  }
  const live = unique.find((card) => card.id === TEXAS_MEDICAID_DEBATE_ID);
  const featured = presentSeededClash(live ?? TEXAS_MEDICAID_CLASH);
  return [featured, ...unique.filter((card) => card.id !== featured.id)];
}
