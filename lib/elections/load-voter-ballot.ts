import { formatDistrictLabel, districtLabelFromOcd } from "@/lib/ballot/district-label";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { normalizeZip } from "@/lib/electability";
import { groupBallotRaces } from "@/lib/elections/ballot-races";
import type { VoterBallotPanel, VoterBallotRace } from "@/lib/elections/hub-types";
import { partyLabel, tierLabel } from "@/lib/platform/types";
import {
  canRank,
  displayName,
  loadHomeOcdIds,
  loadPrimaries,
  loadProfiles,
  ocdMatches,
  platformAdmin,
} from "@/lib/platform/records";
import { parseTier } from "@/lib/platform/scoring";

const empty = (patch: Partial<VoterBallotPanel>): VoterBallotPanel => ({
  signedOut: false,
  needsZip: false,
  districtLabel: null,
  races: [],
  notice: null,
  ...patch,
});

function finite(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function loadVoterBallot(): Promise<VoterBallotPanel> {
  const user = await getServerUser().catch(() => null);
  if (!user) return empty({ signedOut: true });

  try {
    const admin = platformAdmin();
    let profile = await admin
      .from("profiles")
      .select("voting_zip_code, state_code, congressional_district")
      .eq("id", user.id)
      .maybeSingle();
    if (profile.error && isMissingSchema(profile.error)) {
      profile = await admin.from("profiles").select("state_code, congressional_district").eq("id", user.id).maybeSingle();
    }
    if (profile.error) throw new Error(profile.error.message);

    const row = profile.data as {
      voting_zip_code?: string | null;
      state_code: string | null;
      congressional_district: string | null;
    } | null;
    const zip = normalizeZip(row?.voting_zip_code ?? "");
    if (zip.length !== 5) return empty({ needsZip: true });

    const home = await loadHomeOcdIds(admin, user.id);
    const districtLabel =
      districtLabelFromOcd(home) ??
      formatDistrictLabel(row?.state_code, row?.congressional_district);
    const primaries = (await loadPrimaries(admin)).filter((primary) => ocdMatches(home, primary.ocd_id));
    if (primaries.length === 0) {
      return empty({ districtLabel, notice: null, races: [] });
    }

    const primaryIds = primaries.map((primary) => primary.id);
    const [standings, prompts] = await Promise.all([
      admin.from("primary_standings").select("user_id, primary_id, pledged_war_chest").in("primary_id", primaryIds),
      admin
        .from("community_prompts")
        .select("id, primary_id, title, content, upvote_count")
        .in("primary_id", primaryIds)
        .order("upvote_count", { ascending: false })
        .limit(200),
    ]);

    if (standings.error && !isMissingSchema(standings.error)) {
      throw new Error(standings.error.message);
    }
    const standingRows = standings.error
      ? []
      : ((standings.data ?? []) as {
            user_id: string;
            primary_id: string;
            pledged_war_chest: number | string | null;
          }[]);
    const profiles = await loadProfiles(
      admin,
      standingRows.map((standing) => standing.user_id),
    );
    const questionByPrimary = new Map<string, string>();
    if (!prompts.error) {
      for (const prompt of (prompts.data ?? []) as {
        primary_id: string;
        title: string | null;
        content: string | null;
      }[]) {
        if (questionByPrimary.has(prompt.primary_id)) continue;
        const text = prompt.title?.trim() || prompt.content?.trim() || "";
        if (text) questionByPrimary.set(prompt.primary_id, text);
      }
    }

    const byPrimary = new Map<string, VoterBallotRace["candidates"]>();
    for (const standing of standingRows) {
      const profile = profiles.get(standing.user_id);
      if (!profile || !canRank(profile)) continue;
      const tier = parseTier(profile.candidate_tier);
      if (tier === "pundit") continue;
      const primary = primaries.find((item) => item.id === standing.primary_id);
      if (!primary) continue;
      const list = byPrimary.get(primary.id) ?? [];
      list.push({
        id: profile.id,
        name: profile.legal_name?.trim() || displayName(profile),
        party: partyLabel(primary.party),
        tierLabel: tierLabel(tier),
        primaryId: primary.id,
        pledged: finite(standing.pledged_war_chest),
        canPledge: tier === "frontrunner",
      });
      byPrimary.set(primary.id, list);
    }

    const races: VoterBallotRace[] = groupBallotRaces(primaries, byPrimary, questionByPrimary);

    return empty({
      districtLabel,
      races,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load your voter ballot.";
    return empty({
      notice: isMissingSchema({ message }) ? "Apply the platform architecture migration, then reload." : message,
    });
  }
}
