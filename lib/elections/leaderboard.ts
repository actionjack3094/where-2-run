import { isMissingSchema } from "@/lib/db/schema-errors";
import { displayName, loadProfiles, platformAdmin } from "@/lib/platform/records";
import type { Primary } from "@/types/database.types";

export type LeaderboardEntry = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  race: string;
  href: string;
  civicStanding: number;
  warChest: number;
};

const DEMO_SLUGS = [
  "tx-37-dem",
  "tx-37-rep",
  "tx-sd-14-dem",
  "tx-sd-14-rep",
  "austin-mayor-dem",
  "austin-mayor-rep",
];

function raceLabel(primary: Pick<Primary, "state" | "district" | "office_name">) {
  const seat = primary.district ? `${primary.state}-${primary.district}` : primary.state;
  return `${seat} · ${primary.office_name}`;
}

export async function loadElectionLeaderboard(): Promise<LeaderboardEntry[]> {
  const admin = platformAdmin();
  const primaries = await admin
    .from("primaries")
    .select("id, slug, office_name, state, district, general_slug")
    .in("general_slug", ["tx-37", "tx-sd-14", "austin-mayor"]);
  if (primaries.error) {
    if (isMissingSchema(primaries.error)) return [];
    throw new Error(primaries.error.message);
  }
  const races = ((primaries.data ?? []) as Pick<
    Primary,
    "id" | "slug" | "office_name" | "state" | "district" | "general_slug"
  >[]).filter((primary) => DEMO_SLUGS.includes(primary.slug) || primary.general_slug);
  if (races.length === 0) return [];

  const standings = await admin
    .from("primary_standings")
    .select("user_id, primary_id, civic_standing, pledged_war_chest, debates_count")
    .in(
      "primary_id",
      races.map((race) => race.id),
    )
    .gt("debates_count", 0);
  if (standings.error) {
    if (isMissingSchema(standings.error)) return [];
    throw new Error(standings.error.message);
  }
  const rows = (standings.data ?? []) as {
    user_id: string;
    primary_id: string;
    civic_standing: number;
    pledged_war_chest: number | string | null;
    debates_count: number;
  }[];
  const profiles = await loadProfiles(
    admin,
    rows.map((row) => row.user_id),
  );
  const byId = new Map(races.map((race) => [race.id, race]));

  return rows.map((row) => {
    const primary = byId.get(row.primary_id);
    const profile = profiles.get(row.user_id);
    return {
      id: `${row.user_id}:${row.primary_id}`,
      userId: row.user_id,
      name: profile?.legal_name?.trim() || displayName(profile ?? null),
      avatarUrl: profile?.avatar_url ?? null,
      race: primary ? raceLabel(primary) : "Primary",
      href: primary ? `/elections/${primary.slug}` : "/elections",
      civicStanding: row.civic_standing,
      warChest: Number(row.pledged_war_chest ?? 0),
    };
  });
}
