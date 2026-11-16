import { getServerUser } from "@/lib/db/supabase-server";
import { primaryOfficeName, type DirectoryPrimary } from "@/lib/elections/state-directory";
import { loadProfile, platformAdmin } from "@/lib/platform/records";
import type { Primary } from "@/types/database.types";

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
  };
}

export async function loadStateViewer() {
  const user = await getServerUser();
  if (!user) return { signedIn: false, verified: false, point: null };
  try {
    const profile = await loadProfile(platformAdmin(), user.id);
    const point =
      profile?.ideology_x != null && profile.ideology_y != null
        ? { x: profile.ideology_x, y: profile.ideology_y }
        : null;
    return {
      signedIn: true,
      verified: Boolean(profile?.is_verified || profile?.tier2_status === "verified"),
      point,
    };
  } catch {
    return { signedIn: true, verified: false, point: null };
  }
}
