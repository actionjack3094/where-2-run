import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  loadMatchedPrimaryIds,
  openChallengeInScope,
  type MatchedPrimaryScope,
} from "@/lib/debates/matched-primaries";
import { excerpt, primaryLookup } from "@/lib/debates/queue-shared";
import { loadUnansweredQuestions, type UnansweredQuestion } from "@/lib/debates/unanswered-questions";
import { displayName, loadProfiles, platformAdmin } from "@/lib/platform/records";
import { parseTier } from "@/lib/platform/scoring";
import { tierLabel } from "@/lib/platform/types";

export type OpenChallenge = {
  id: string;
  primaryId: string;
  stance: string;
  office: string;
  party: string;
  createdAt: string;
  authorName: string;
  authorStatus: string;
};

export type { UnansweredQuestion };

export type ActionQueue = {
  challenges: OpenChallenge[];
  questions: UnansweredQuestion[];
  notice: string | null;
  party: MatchedPrimaryScope["party"];
  matchedIds: string[];
};

function partyName(party: string) {
  return party === "republican" ? "Republican" : "Democratic";
}

export async function loadActionQueue(userId: string | null = null): Promise<ActionQueue> {
  try {
    const admin = platformAdmin();
    const scope = await loadMatchedPrimaryIds(userId);
    if (!scope.calibrated || !scope.party) {
      return {
        challenges: [],
        questions: [],
        notice: userId
          ? "Calibrate your ideology vector to open primaries in your party."
          : "Sign in and calibrate to see primaries in your party.",
        party: null,
        matchedIds: [],
      };
    }
    const [challenges, questions] = await Promise.all([
      loadOpenChallenges(admin, scope),
      loadUnansweredQuestions(admin, scope),
    ]);
    return {
      challenges: challenges.rows,
      questions: questions.rows,
      notice: challenges.notice ?? questions.notice,
      party: scope.party,
      matchedIds: [...scope.ids],
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load the action queue.";
    return {
      challenges: [],
      questions: [],
      notice: isMissingSchema({ message }) ? "Apply the platform architecture migration, then reload." : message,
      party: null,
      matchedIds: [],
    };
  }
}

async function loadOpenChallenges(
  admin: ReturnType<typeof platformAdmin>,
  scope: MatchedPrimaryScope,
) {
  if (scope.ids.size === 0) return { rows: [], notice: null };
  const result = await admin
    .from("arena_debates")
    .select("id, stance_a, primary_id, candidate_a_id, created_at")
    .eq("status", "open_challenge")
    .is("candidate_b_id", null)
    .in("primary_id", [...scope.ids])
    .order("created_at", { ascending: false })
    .limit(30);
  if (result.error) {
    if (isMissingSchema(result.error)) return { rows: [], notice: "Apply the platform architecture migration, then reload." };
    throw new Error(result.error.message);
  }

  const rows = ((result.data ?? []) as {
    id: string;
    stance_a: string;
    primary_id: string;
    candidate_a_id: string | null;
    created_at: string;
  }[]).filter((row) => scope.ids.has(row.primary_id));
  const [primaries, profiles] = await Promise.all([
    primaryLookup(admin, rows.map((row) => row.primary_id)),
    loadProfiles(admin, rows.map((row) => row.candidate_a_id ?? "")),
  ]);

  return {
    notice: null,
    rows: rows.flatMap((row) => {
      const primary = primaries.get(row.primary_id);
      if (!primary || !openChallengeInScope({ primaryId: row.primary_id, party: primary.party }, scope)) {
        return [];
      }
      const profile = row.candidate_a_id ? profiles.get(row.candidate_a_id) : undefined;
      return [{
        id: row.id,
        primaryId: row.primary_id,
        stance: excerpt(row.stance_a),
        office: primary.office,
        party: partyName(primary.party),
        createdAt: row.created_at,
        authorName: profile?.legal_name?.trim() || displayName(profile ?? null),
        authorStatus: tierLabel(parseTier(profile?.candidate_tier)),
      }];
    }),
  };
}
