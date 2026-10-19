import { isMissingSchema } from "@/lib/db/schema-errors";
import type { MatchedPrimaryScope } from "@/lib/debates/matched-primaries";
import { excerpt, primaryLookup } from "@/lib/debates/queue-shared";
import { platformAdmin } from "@/lib/platform/records";

export type UnansweredQuestion = {
  id: string;
  title: string;
  content: string;
  office: string;
  primarySlug: string | null;
  createdAt: string;
};

export async function loadUnansweredQuestions(
  admin: ReturnType<typeof platformAdmin>,
  scope: MatchedPrimaryScope,
) {
  if (scope.ids.size === 0) return { rows: [] as UnansweredQuestion[], notice: null };
  const prompts = await admin
    .from("community_prompts")
    .select("id, primary_id, title, content, created_at")
    .in("primary_id", [...scope.ids])
    .order("created_at", { ascending: false })
    .limit(40);
  if (prompts.error) {
    if (isMissingSchema(prompts.error)) {
      return { rows: [] as UnansweredQuestion[], notice: "Apply the constituent agenda migration, then reload." };
    }
    throw new Error(prompts.error.message);
  }

  const fresh = (prompts.data ?? []) as {
    id: string;
    primary_id: string;
    title: string;
    content: string;
    created_at: string;
  }[];
  const ids = fresh.map((row) => row.id);
  const answered = new Set<string>();
  if (ids.length > 0) {
    const sources = await admin.from("debate_prompts").select("source_prompt_id").in("source_prompt_id", ids);
    if (!sources.error) {
      for (const row of (sources.data ?? []) as { source_prompt_id: string | null }[]) {
        if (row.source_prompt_id) answered.add(row.source_prompt_id);
      }
    }
  }

  const waiting = fresh
    .filter((row) => !answered.has(row.id) && scope.ids.has(row.primary_id))
    .slice(0, 20);
  const primaries = await primaryLookup(admin, waiting.map((row) => row.primary_id));

  return {
    notice: null as string | null,
    rows: waiting.flatMap((row) => {
      const primary = primaries.get(row.primary_id);
      if (!primary || primary.party !== scope.party) return [];
      return [{
        id: row.id,
        title: row.title.trim() || "Constituent question",
        content: excerpt(row.content, 280),
        office: primary.office,
        primarySlug: primary.slug,
        createdAt: row.created_at,
      }];
    }),
  };
}
