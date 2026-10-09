import {
  cosineIdeologicalSimilarity,
  euclideanIdeologicalDistance,
  parseIdeologicalVector,
  type IdeologicalPoint,
} from "@/app/lib/ideological-distance";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { loadProfile, loadProfiles, platformAdmin, schemaMessage, displayName } from "@/lib/platform/records";
import { partyFromCoordinate } from "@/lib/platform/scoring";
import type { Primary, PrimaryQuestion } from "@/types/database.types";

const TOP_MATCHES = 12;

export type MatchedCandidate = {
  id: string;
  name: string;
  primaryId: string;
  distance: number;
  similarity: number | null;
  vector: IdeologicalPoint;
};

export type MatchedQuestion = {
  id: string;
  primaryId: string;
  prompt: string;
  kind: string;
  distance: number;
  candidateName: string;
  office: string;
  slug: string;
  state: string;
};

export type MatchedShowdown = {
  id: string;
  primaryId: string;
  prompt: string;
  stanceA: string;
  stanceB: string | null;
  sideA: string;
  sideB: string | null;
  candidateAId: string;
  candidateBId: string | null;
  distance: number;
  office: string;
  slug: string;
  state: string;
  seatLockedUntil: string | null;
};

export type IdeologicalDebateFeed = {
  signedOut: boolean;
  needsTownhall: boolean;
  userVector: IdeologicalPoint | null;
  matches: MatchedCandidate[];
  questions: MatchedQuestion[];
  showdowns: MatchedShowdown[];
};

const emptyFeed = (patch: Partial<IdeologicalDebateFeed>): IdeologicalDebateFeed => ({
  signedOut: false,
  needsTownhall: false,
  userVector: null,
  matches: [],
  questions: [],
  showdowns: [],
  ...patch,
});

type CandidateRow = {
  id: string;
  display_name: string | null;
  primary_id: string | null;
  ideological_vector: unknown;
};

/**
 * Rank nationwide candidates against the viewer's Townhall coordinate,
 * then load the questions and active showdowns on those primaries.
 */
export async function loadIdeologicalDebateFeed(userId: string | null): Promise<IdeologicalDebateFeed> {
  if (!userId) return emptyFeed({ signedOut: true });

  const admin = platformAdmin();
  const profile = await loadProfile(admin, userId);
  if (!profile || profile.ideology_x == null || profile.ideology_y == null) {
    return emptyFeed({ needsTownhall: true });
  }

  const userVector: IdeologicalPoint = { x: profile.ideology_x, y: profile.ideology_y };
  const party = partyFromCoordinate(userVector);

  const candidateResult = await admin
    .from("candidates")
    .select("id, display_name, primary_id, ideological_vector");
  if (candidateResult.error) {
    if (isMissingSchema(candidateResult.error)) return emptyFeed({ userVector });
    throw new Error(schemaMessage(candidateResult.error) ?? candidateResult.error.message);
  }

  const matches: MatchedCandidate[] = [];
  for (const row of (candidateResult.data ?? []) as CandidateRow[]) {
    if (!row.primary_id) continue;
    const vector = parseIdeologicalVector(row.ideological_vector);
    if (!vector || partyFromCoordinate(vector) !== party) continue;
    const distance = euclideanIdeologicalDistance(userVector, vector);
    if (distance == null) continue;
    matches.push({
      id: row.id,
      name: row.display_name?.trim() || "Candidate",
      primaryId: row.primary_id,
      distance,
      similarity: cosineIdeologicalSimilarity(userVector, vector),
      vector,
    });
  }
  matches.sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name));
  const top = matches.slice(0, TOP_MATCHES);
  const primaryIds = [...new Set(top.map((row) => row.primaryId))];
  if (primaryIds.length === 0) return emptyFeed({ userVector });

  const distanceByPrimary = new Map<string, number>();
  const nameByPrimary = new Map<string, string>();
  for (const row of top) {
    const current = distanceByPrimary.get(row.primaryId);
    if (current == null || row.distance < current) {
      distanceByPrimary.set(row.primaryId, row.distance);
      nameByPrimary.set(row.primaryId, row.name);
    }
  }

  const [questionResult, debateResult, primaryResult] = await Promise.all([
    admin
      .from("primary_questions")
      .select("id, primary_id, prompt, kind, created_at")
      .in("primary_id", primaryIds),
    admin
      .from("arena_debates")
      .select(
        "id, primary_id, prompt_id, candidate_a_id, candidate_b_id, stance_a, stance_b, seat_locked_until, status",
      )
      .in("primary_id", primaryIds)
      .eq("status", "active"),
    admin
      .from("primaries")
      .select("id, slug, office_name, office, state, party")
      .in("id", primaryIds),
  ]);

  if (questionResult.error && !isMissingSchema(questionResult.error)) {
    throw new Error(schemaMessage(questionResult.error) ?? questionResult.error.message);
  }
  if (debateResult.error && !isMissingSchema(debateResult.error)) {
    throw new Error(schemaMessage(debateResult.error) ?? debateResult.error.message);
  }
  if (primaryResult.error && !isMissingSchema(primaryResult.error)) {
    throw new Error(schemaMessage(primaryResult.error) ?? primaryResult.error.message);
  }

  const primaries = new Map(
    ((primaryResult.data ?? []) as Pick<Primary, "id" | "slug" | "office_name" | "state" | "party">[]).map(
      (row) => [row.id, row],
    ),
  );
  const officeOf = (primaryId: string) => {
    const primary = primaries.get(primaryId) as (Primary & { office?: string | null }) | undefined;
    return primary?.office?.trim() || primary?.office_name || "Primary";
  };

  const questions: MatchedQuestion[] = ((questionResult.error ? [] : questionResult.data) ?? [])
    .map((row) => {
      const question = row as PrimaryQuestion;
      const primary = primaries.get(question.primary_id);
      return {
        id: question.id,
        primaryId: question.primary_id,
        prompt: question.prompt,
        kind: question.kind,
        distance: distanceByPrimary.get(question.primary_id) ?? Number.POSITIVE_INFINITY,
        candidateName: nameByPrimary.get(question.primary_id) ?? "Candidate",
        office: officeOf(question.primary_id),
        slug: primary?.slug ?? question.primary_id,
        state: primary?.state ?? "",
      };
    })
    .sort((left, right) => left.distance - right.distance || left.prompt.localeCompare(right.prompt));

  const debates = (debateResult.error ? [] : debateResult.data ?? []) as {
    id: string;
    primary_id: string;
    candidate_a_id: string;
    candidate_b_id: string | null;
    stance_a: string;
    stance_b: string | null;
    seat_locked_until: string | null;
    prompt_id: string;
  }[];
  const profiles = await loadProfiles(
    admin,
    debates.flatMap((debate) => [debate.candidate_a_id, debate.candidate_b_id ?? ""]),
  );
  const promptIds = debates.map((debate) => debate.prompt_id);
  const promptText = new Map<string, string>();
  if (promptIds.length > 0) {
    const prompts = await admin.from("debate_prompts").select("id, prompt_text").in("id", promptIds);
    if (!prompts.error) {
      for (const row of (prompts.data ?? []) as { id: string; prompt_text: string }[]) {
        promptText.set(row.id, row.prompt_text);
      }
    }
  }

  const showdowns: MatchedShowdown[] = debates
    .filter((debate) => debate.candidate_b_id)
    .map((debate) => {
      const primary = primaries.get(debate.primary_id);
      return {
        id: debate.id,
        primaryId: debate.primary_id,
        prompt: promptText.get(debate.prompt_id) ?? "Active debate",
        stanceA: debate.stance_a,
        stanceB: debate.stance_b,
        sideA: displayName(profiles.get(debate.candidate_a_id) ?? null),
        sideB: debate.candidate_b_id ? displayName(profiles.get(debate.candidate_b_id) ?? null) : null,
        candidateAId: debate.candidate_a_id,
        candidateBId: debate.candidate_b_id,
        distance: distanceByPrimary.get(debate.primary_id) ?? Number.POSITIVE_INFINITY,
        office: officeOf(debate.primary_id),
        slug: primary?.slug ?? debate.primary_id,
        state: primary?.state ?? "",
        seatLockedUntil: debate.seat_locked_until,
      };
    })
    .sort((left, right) => left.distance - right.distance);

  return {
    signedOut: false,
    needsTownhall: false,
    userVector,
    matches: top,
    questions,
    showdowns,
  };
}
