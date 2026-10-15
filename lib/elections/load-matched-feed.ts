import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { matchedOfficeLabel, rankMatchedRaces, type MatchedRace } from "@/lib/elections/matched";
import type { MatchedPrimaryCard } from "@/lib/elections/hub-types";
import {
  alignedLane,
  groupGeneralRaces,
  primaryOfficeName,
  type DirectoryPrimary,
} from "@/lib/elections/state-directory";
import { loadPrimaries, loadProfile, platformAdmin } from "@/lib/platform/records";
import type { Primary } from "@/types/database.types";

export type MatchedFeed = {
  calibrated: boolean;
  notice: string | null;
  races: MatchedPrimaryCard[];
};

function finite(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function primaryTitle(race: Pick<MatchedRace, "officeName" | "state" | "district">) {
  const label = matchedOfficeLabel(race);
  return /primary$/i.test(label) ? label : `${label} Primary`;
}

function toDirectoryPrimary(primary: Primary): DirectoryPrimary {
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

async function loadTopQuestions(primaryIds: string[]) {
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
  for (const row of (result.data ?? []) as {
    primary_id: string;
    title: string | null;
    content: string | null;
  }[]) {
    if (questions.has(row.primary_id)) continue;
    const text = row.title?.trim() || row.content?.trim() || "";
    if (text) questions.set(row.primary_id, text);
  }
  return questions;
}

export async function loadMatchedFeed(): Promise<MatchedFeed> {
  const user = await getServerUser().catch(() => null);
  if (!user) return { calibrated: false, notice: null, races: [] };

  try {
    const admin = platformAdmin();
    const [profile, primaries] = await Promise.all([
      loadProfile(admin, user.id),
      loadPrimaries(admin),
    ]);
    if (profile?.ideology_x == null || profile.ideology_y == null) {
      return { calibrated: false, notice: null, races: [] };
    }
    const viewer = { x: profile.ideology_x, y: profile.ideology_y };
    const matched: MatchedRace[] = groupGeneralRaces(primaries.map(toDirectoryPrimary)).map((race) => ({
      ...race,
      incumbentName: null,
    }));
    const races = rankMatchedRaces(matched, viewer);
    const questions = await loadTopQuestions(races.flatMap((race) => race.lanes.map((lane) => lane.id)));
    return {
      calibrated: true,
      notice: null,
      races: races.map((race) => {
        const lane = alignedLane(race, viewer);
        const question = lane ? questions.get(lane.id) : null;
        return {
          id: race.generalSlug,
          title: primaryTitle(race),
          match: race.alignment,
          question: question ?? "No constituent question is filed for this district yet.",
          floorHref: lane ? `/debates/create?primary=${encodeURIComponent(lane.slug)}` : "/debates/create",
          campaignHref: lane
            ? `/campaign-hub?primary=${encodeURIComponent(lane.slug)}`
            : "/campaign-hub",
        };
      }),
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not rank matched primaries.";
    return {
      calibrated: false,
      notice: isMissingSchema({ message }) ? "Apply the platform architecture migration, then reload." : message,
      races: [],
    };
  }
}
