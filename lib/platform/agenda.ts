import { isMissingSchema } from "@/lib/db/schema-errors";
import { platformAdmin, type PlatformAdmin } from "@/lib/platform/records";

export const AGENDA_TITLE_MAX = 100;
export const AGENDA_CONTENT_MAX = 500;
export const AGENDA_TOP = 5;

export type AgendaPrompt = {
  id: string;
  primaryId: string;
  voterId: string;
  title: string;
  content: string;
  upvoteCount: number;
  createdAt: string;
  viewerUpvoted: boolean;
};

type AgendaRow = {
  id: string;
  primary_id: string;
  voter_id: string;
  title: string;
  content: string;
  upvote_count: number;
  created_at: string;
};

export function cleanAgendaTitle(value: string) {
  const title = value.trim();
  if (title.length < 1 || title.length > AGENDA_TITLE_MAX) return null;
  return title;
}

export function cleanAgendaContent(value: string) {
  const content = value.trim();
  if (content.length < 1 || content.length > AGENDA_CONTENT_MAX) return null;
  return content;
}

export function agendaPromptText(title: string, content: string) {
  return `${title.trim()}\n${content.trim()}`.trim();
}

export async function loadCommunityPrompts(
  primaryId: string,
  viewerId: string | null,
  limit?: number,
): Promise<{ prompts: AgendaPrompt[]; missing: boolean }> {
  const admin = platformAdmin();
  let query = admin
    .from("community_prompts")
    .select("id, primary_id, voter_id, title, content, upvote_count, created_at")
    .eq("primary_id", primaryId)
    .order("upvote_count", { ascending: false })
    .order("created_at", { ascending: true });
  if (limit != null) query = query.limit(limit);
  const result = await query;
  if (result.error) {
    if (isMissingSchema(result.error)) return { prompts: [], missing: true };
    throw new Error(result.error.message);
  }
  const rows = (result.data ?? []) as AgendaRow[];
  const upvoted = await viewerUpvotes(admin, viewerId, rows.map((row) => row.id));
  return {
    missing: false,
    prompts: rows.map((row) => ({
      id: row.id,
      primaryId: row.primary_id,
      voterId: row.voter_id,
      title: row.title,
      content: row.content,
      upvoteCount: row.upvote_count,
      createdAt: row.created_at,
      viewerUpvoted: upvoted.has(row.id),
    })),
  };
}

async function viewerUpvotes(admin: PlatformAdmin, viewerId: string | null, promptIds: string[]) {
  const chosen = new Set<string>();
  if (!viewerId || promptIds.length === 0) return chosen;
  const { data, error } = await admin
    .from("prompt_upvotes")
    .select("prompt_id")
    .eq("voter_id", viewerId)
    .in("prompt_id", promptIds);
  if (error) {
    if (isMissingSchema(error)) return chosen;
    throw new Error(error.message);
  }
  for (const row of (data ?? []) as { prompt_id: string }[]) chosen.add(row.prompt_id);
  return chosen;
}
