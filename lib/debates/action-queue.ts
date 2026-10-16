import { isMissingSchema } from "@/lib/db/schema-errors";
import { excerpt, primaryLookup } from "@/lib/debates/queue-shared";
import { loadUnansweredQuestions, type UnansweredQuestion } from "@/lib/debates/unanswered-questions";
import { displayName, loadProfiles, platformAdmin } from "@/lib/platform/records";
import { parseTier } from "@/lib/platform/scoring";
import { tierLabel } from "@/lib/platform/types";

export type OpenChallenge = {
  id: string;
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
};

export async function loadActionQueue(): Promise<ActionQueue> {
  try {
    const admin = platformAdmin();
    const [challenges, questions] = await Promise.all([
      loadOpenChallenges(admin),
      loadUnansweredQuestions(admin),
    ]);
    return {
      challenges: challenges.rows,
      questions: questions.rows,
      notice: challenges.notice ?? questions.notice,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load the action queue.";
    return {
      challenges: [],
      questions: [],
      notice: isMissingSchema({ message }) ? "Apply the platform architecture migration, then reload." : message,
    };
  }
}

async function loadOpenChallenges(admin: ReturnType<typeof platformAdmin>) {
  const result = await admin
    .from("arena_debates")
    .select("id, stance_a, primary_id, candidate_a_id, created_at")
    .eq("status", "open_challenge")
    .is("candidate_b_id", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (result.error) {
    if (isMissingSchema(result.error)) return { rows: [], notice: "Apply the platform architecture migration, then reload." };
    throw new Error(result.error.message);
  }

  const rows = (result.data ?? []) as {
    id: string;
    stance_a: string;
    primary_id: string;
    candidate_a_id: string | null;
    created_at: string;
  }[];
  const [primaries, profiles] = await Promise.all([
    primaryLookup(admin, rows.map((row) => row.primary_id)),
    loadProfiles(admin, rows.map((row) => row.candidate_a_id ?? "")),
  ]);

  return {
    notice: null,
    rows: rows.map((row) => {
      const primary = primaries.get(row.primary_id);
      const profile = row.candidate_a_id ? profiles.get(row.candidate_a_id) : undefined;
      return {
        id: row.id,
        stance: excerpt(row.stance_a),
        office: primary?.office ?? "Primary",
        party: primary?.party === "republican" ? "Republican" : "Democrat",
        createdAt: row.created_at,
        authorName: profile?.legal_name?.trim() || displayName(profile ?? null),
        authorStatus: tierLabel(parseTier(profile?.candidate_tier)),
      };
    }),
  };
}
