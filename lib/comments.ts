import { supabase } from "@/lib/db/supabase";
import type { Comment, CommentWithAuthor, DebateCandidate } from "@/types/database.types";

export const COMMENT_MAX_LENGTH = 2000;

export async function loadDebateComments(debateId: string): Promise<CommentWithAuthor[]> {
  const { data: rows, error } = await supabase
    .from("comments")
    .select("id, debate_id, author_id, body, created_at, ai_stance_score")
    .eq("debate_id", debateId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const comments = (rows ?? []) as Comment[];
  const authorIds = [...new Set(comments.map((row) => row.author_id).filter(Boolean))];
  const { data: authorRows } = authorIds.length
    ? await supabase.from("users").select("id, username").in("id", authorIds)
    : { data: [] as DebateCandidate[] };

  const authorById = new Map(
    ((authorRows ?? []) as DebateCandidate[]).map((row) => [row.id, row]),
  );

  return comments.map((row) => ({
    ...row,
    author: authorById.get(row.author_id) ?? null,
  }));
}
