import { isMissingSchema } from "@/lib/db/schema-errors";
import { districtGauntletDue, GAUNTLET_PROMPT_COUNT } from "@/lib/debates/gauntlet";
import { loadCommunityPrompts } from "@/lib/platform/agenda";
import { platformAdmin, type PlatformAdmin } from "@/lib/platform/records";

export type GauntletPrompt = {
  id: string;
  title: string;
  content: string;
  filed: string | null;
};

export type DistrictGauntlet = {
  primaryId: string;
  slug: string;
  office: string;
  prompts: GauntletPrompt[];
};

export async function loadDistrictGauntlet(
  userId: string,
  admin: PlatformAdmin = platformAdmin(),
): Promise<DistrictGauntlet | null> {
  const standings = await admin
    .from("primary_standings")
    .select("primary_id")
    .eq("user_id", userId);
  if (standings.error) {
    if (isMissingSchema(standings.error)) return null;
    return null;
  }
  const primaryIds = ((standings.data ?? []) as { primary_id: string }[]).map((row) => row.primary_id);
  if (primaryIds.length === 0) return null;

  const primaries = await admin
    .from("primaries")
    .select("id, slug, office_name, state, district, primary_date, status")
    .in("id", primaryIds);
  if (primaries.error) return null;

  const peers = await admin.from("primary_standings").select("primary_id").in("primary_id", primaryIds);
  const counts = new Map<string, number>();
  if (!peers.error) {
    for (const row of (peers.data ?? []) as { primary_id: string }[]) {
      counts.set(row.primary_id, (counts.get(row.primary_id) ?? 0) + 1);
    }
  }

  const due = ((primaries.data ?? []) as {
    id: string;
    slug: string;
    office_name: string;
    state: string;
    district: string | null;
    primary_date: string;
  }[]).find((primary) =>
    districtGauntletDue({
      primaryDate: primary.primary_date,
      contenders: counts.get(primary.id) ?? 0,
    }),
  );
  if (!due) return null;

  const agenda = await loadCommunityPrompts(due.id, userId, GAUNTLET_PROMPT_COUNT).catch(() => ({
    prompts: [],
    missing: false,
  }));
  const filed = await admin
    .from("gauntlet_stances")
    .select("prompt_id, content")
    .eq("user_id", userId)
    .eq("primary_id", due.id);
  const filedByPrompt = new Map<string, string>();
  if (!filed.error) {
    for (const row of (filed.data ?? []) as { prompt_id: string; content: string }[]) {
      filedByPrompt.set(row.prompt_id, row.content);
    }
  }

  const seat = due.district ? `${due.state}-${due.district}` : due.state;
  return {
    primaryId: due.id,
    slug: due.slug,
    office: `${seat} · ${due.office_name}`,
    prompts: agenda.prompts.slice(0, GAUNTLET_PROMPT_COUNT).map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      filed: filedByPrompt.get(prompt.id) ?? null,
    })),
  };
}
