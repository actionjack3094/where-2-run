import { platformAdmin } from "@/lib/platform/records";
import { primaryOfficeName, type DirectoryPrimary } from "@/lib/elections/state-directory";
import type { GeoScope, OfficeFilter, ViabilityFilter } from "@/lib/elections/matched";
import type { Primary } from "@/types/database.types";

export function asScope(value: string | undefined): GeoScope {
  if (value === "state" || value === "nationwide") return value;
  return "backyard";
}

export function asLevel(value: string | undefined): OfficeFilter {
  if (value === "federal" || value === "state" || value === "local") return value;
  return "all";
}

export function asSeats(value: string | undefined): ViabilityFilter {
  return value === "open" ? "open" : "all";
}

function finite(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function toDirectoryPrimary(primary: Primary): DirectoryPrimary {
  return {
    id: primary.id,
    party: primary.party,
    officeName: primaryOfficeName(primary.office_name, primary.office),
    state: primary.state,
    district: primary.district,
    slug: primary.slug,
    generalSlug: primary.general_slug,
    baselineX: finite(primary.baseline_x),
    baselineY: finite(primary.baseline_y),
    status: primary.status,
    level: primary.level ?? null,
    cycleYear: finite(primary.cycle_year),
    ocdId: primary.ocd_id,
  };
}

export async function loadTopQuestions(primaryIds: string[]) {
  const unique = [...new Set(primaryIds)];
  const questions = new Map<string, string>();
  if (unique.length === 0) return questions;
  const result = await platformAdmin()
    .from("community_prompts")
    .select("primary_id, title, content, upvote_count")
    .in("primary_id", unique)
    .order("upvote_count", { ascending: false })
    .limit(200);
  if (result.error) return questions;
  for (const row of (result.data ?? []) as { primary_id: string; title: string | null; content: string | null }[]) {
    if (questions.has(row.primary_id)) continue;
    const text = row.title?.trim() || row.content?.trim() || "";
    if (text) questions.set(row.primary_id, text);
  }
  return questions;
}
