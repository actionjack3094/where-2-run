import { isMissingSchema } from "@/lib/db/schema-errors";
import { displayName, platformAdmin, type PlatformProfile } from "@/lib/platform/records";

export const QUESTION_MAX = 280;
export const ANSWER_MAX = 2000;

export type TownHallAnswer = {
  id: string;
  candidateId: string;
  candidateName: string;
  content: string;
  createdAt: string;
};

export type TownHallQuestion = {
  id: string;
  voterId: string;
  voterName: string;
  content: string;
  createdAt: string;
  answers: TownHallAnswer[];
};

export function cleanTownHallText(value: string, max: number) {
  const text = value.trim();
  if (text.length < 1 || text.length > max) return null;
  return text;
}

type QuestionRow = {
  id: string;
  debate_id: string;
  voter_id: string;
  content: string;
  created_at: string;
};

type AnswerRow = {
  id: string;
  question_id: string;
  candidate_id: string;
  content: string;
  created_at: string;
};

export async function loadTownHalls(debateIds: string[]) {
  const halls = new Map<string, TownHallQuestion[]>();
  const unique = [...new Set(debateIds.filter(Boolean))];
  if (unique.length === 0) return halls;

  const admin = platformAdmin();
  const questions = await admin
    .from("constituent_questions")
    .select("id, debate_id, voter_id, content, created_at")
    .in("debate_id", unique)
    .order("created_at", { ascending: true });
  if (questions.error) {
    if (isMissingSchema(questions.error)) return halls;
    throw new Error(questions.error.message);
  }
  const questionRows = (questions.data ?? []) as QuestionRow[];
  const questionIds = questionRows.map((row) => row.id);
  const answerRows: AnswerRow[] = [];
  if (questionIds.length > 0) {
    const answers = await admin
      .from("candidate_answers")
      .select("id, question_id, candidate_id, content, created_at")
      .in("question_id", questionIds)
      .order("created_at", { ascending: true });
    if (answers.error) {
      if (!isMissingSchema(answers.error)) throw new Error(answers.error.message);
    } else {
      answerRows.push(...((answers.data ?? []) as AnswerRow[]));
    }
  }

  const names = await loadNames(admin, [
    ...questionRows.map((row) => row.voter_id),
    ...answerRows.map((row) => row.candidate_id),
  ]);
  const answersByQuestion = new Map<string, TownHallAnswer[]>();
  for (const row of answerRows) {
    const list = answersByQuestion.get(row.question_id) ?? [];
    list.push({
      id: row.id,
      candidateId: row.candidate_id,
      candidateName: names.get(row.candidate_id) ?? "Contender",
      content: row.content,
      createdAt: row.created_at,
    });
    answersByQuestion.set(row.question_id, list);
  }
  for (const row of questionRows) {
    const list = halls.get(row.debate_id) ?? [];
    list.push({
      id: row.id,
      voterId: row.voter_id,
      voterName: names.get(row.voter_id) ?? "Constituent",
      content: row.content,
      createdAt: row.created_at,
      answers: answersByQuestion.get(row.id) ?? [],
    });
    halls.set(row.debate_id, list);
  }
  return halls;
}

async function loadNames(admin: ReturnType<typeof platformAdmin>, ids: string[]) {
  const names = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return names;
  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name, full_name, legal_name, is_verified")
    .in("id", unique);
  if (error) return names;
  for (const row of (data ?? []) as {
    id: string;
    display_name: string | null;
    full_name: string | null;
    legal_name: string | null;
    is_verified: boolean;
  }[]) {
    const verified = row.is_verified && row.legal_name?.trim();
    names.set(row.id, verified ? row.legal_name!.trim() : displayName(row as PlatformProfile));
  }
  return names;
}
