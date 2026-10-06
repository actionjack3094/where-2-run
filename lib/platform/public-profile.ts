import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  ARENA_PUBLIC_COLUMNS,
  displayName,
  loadProfile,
  platformAdmin,
  type PlatformProfile,
} from "@/lib/platform/records";
import { parseTier, tierForStanding, type CandidateTierName } from "@/lib/platform/scoring";
import { partyLabel, tierLabel } from "@/lib/platform/types";
import { loadTownHalls, type TownHallQuestion } from "@/lib/platform/town-hall";
import type { ArenaDebate, Primary, PrimaryStanding } from "@/types/database.types";

export type ProfileStanding = {
  primaryId: string;
  slug: string;
  label: string;
  civicStanding: number;
  debatesLogged: number;
  policyConsistency: number;
  ties: number;
  rank: number;
  fieldSize: number;
  tier: CandidateTierName;
};

export type ProfileDebate = {
  id: string;
  prompt: string;
  office: string;
  ownStance: string;
  opponentName: string;
  result: "Win" | "Loss" | "Tie" | "Closed";
  createdAt: string;
  candidateAId: string;
  candidateBId: string | null;
  questions: TownHallQuestion[];
};

export type WarChest = {
  primaryId: string;
  label: string;
  amount: number;
};

export type ArenaPublicProfile = {
  id: string;
  name: string;
  bio: string | null;
  tier: CandidateTierName;
  tierLabel: string;
  showVerified: boolean;
  avatarUrl: string | null;
  ideologyX: number | null;
  ideologyY: number | null;
  standings: ProfileStanding[];
  warChests: WarChest[];
  history: ProfileDebate[];
};

function publicName(profile: {
  is_verified?: boolean | null;
  tier2_status?: string | null;
  legal_name?: string | null;
  display_name?: string | null;
  full_name?: string | null;
}) {
  const verified = Boolean(profile.is_verified || profile.tier2_status === "verified");
  if (verified && profile.legal_name?.trim()) return profile.legal_name.trim();
  return displayName({
    display_name: profile.display_name ?? null,
    full_name: profile.full_name ?? null,
  });
}

export async function loadArenaPublicProfile(userId: string): Promise<ArenaPublicProfile | null> {
  const admin = platformAdmin();
  let profile: PlatformProfile | null;
  try {
    profile = await loadProfile(admin, userId);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (isMissingSchema({ message })) return null;
    throw caught;
  }
  if (!profile) return null;

  const tier = parseTier(profile.candidate_tier);
  const { data: standingRows, error: standingError } = await admin
    .from("primary_standings")
    .select(
      "id, user_id, primary_id, civic_standing, debates_count, debates_logged, policy_consistency, ties, created_at, updated_at",
    )
    .eq("user_id", userId);
  if (standingError) {
    if (isMissingSchema(standingError)) {
      return {
        id: profile.id,
        name: publicName(profile),
        bio: null,
        tier,
        tierLabel: tierLabel(tier),
        showVerified: tier === "declared_candidate" || tier === "frontrunner",
        avatarUrl: profile.avatar_url,
        ideologyX: profile.ideology_x,
        ideologyY: profile.ideology_y,
        standings: [],
        warChests: [],
        history: [],
      };
    }
    throw new Error(standingError.message);
  }
  const mine = (standingRows ?? []) as PrimaryStanding[];
  const primaryIds = mine.map((row) => row.primary_id);
  const primaries = new Map<string, Primary>();
  const fieldByPrimary = new Map<string, { user_id: string; civic_standing: number }[]>();
  if (primaryIds.length > 0) {
    const primaryResult = await admin
      .from("primaries")
      .select("id, party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug, created_at")
      .in("id", primaryIds);
    if (primaryResult.error) throw new Error(primaryResult.error.message);
    for (const row of (primaryResult.data ?? []) as Primary[]) primaries.set(row.id, row);

    const fieldResult = await admin
      .from("primary_standings")
      .select("user_id, primary_id, civic_standing, debates_count")
      .in("primary_id", primaryIds)
      .gt("debates_count", 0);
    if (fieldResult.error) throw new Error(fieldResult.error.message);
    const peers = (fieldResult.data ?? []) as {
      user_id: string;
      primary_id: string;
      civic_standing: number;
      debates_count: number;
    }[];
    const peerProfiles = await admin
      .from("profiles")
      .select("id, is_synthetic")
      .in("id", [...new Set(peers.map((row) => row.user_id))]);
    if (peerProfiles.error) throw new Error(peerProfiles.error.message);
    const synthetic = new Set(
      ((peerProfiles.data ?? []) as { id: string; is_synthetic: boolean }[])
        .filter((row) => row.is_synthetic)
        .map((row) => row.id),
    );
    for (const row of peers) {
      if (synthetic.has(row.user_id)) continue;
      const list = fieldByPrimary.get(row.primary_id) ?? [];
      list.push({ user_id: row.user_id, civic_standing: row.civic_standing });
      fieldByPrimary.set(row.primary_id, list);
    }
  }

  const standings: ProfileStanding[] = mine
    .filter((row) => row.debates_count > 0)
    .map((row) => {
      const primary = primaries.get(row.primary_id);
      const field = fieldByPrimary.get(row.primary_id) ?? [];
      const seat = primary?.district ? `${primary.state}-${primary.district}` : primary?.state ?? "";
      const party = primary?.party === "republican" ? "republican" : primary?.party === "nonpartisan" ? "nonpartisan" : "democrat";
      const rank = 1 + field.filter((peer) => peer.civic_standing > row.civic_standing).length;
      return {
        primaryId: row.primary_id,
        slug: primary?.slug ?? "",
        label: primary ? `${partyLabel(party)} · ${seat} · ${primary.office_name}` : "Primary",
        civicStanding: row.civic_standing,
        debatesLogged: row.debates_logged ?? row.debates_count,
        policyConsistency: row.policy_consistency ?? 100,
        ties: row.ties,
        rank,
        fieldSize: field.length,
        tier: tierForStanding(
          row.civic_standing,
          field.map((peer) => peer.civic_standing),
          profile.is_verified || profile.tier2_status === "verified",
          profile.legal_name,
        ),
      };
    })
    .sort((a, b) => a.rank - b.rank || b.civicStanding - a.civicStanding);

  const historyResult = await admin
    .from("arena_debates")
    .select(ARENA_PUBLIC_COLUMNS)
    .eq("status", "concluded")
    .or(`candidate_a_id.eq.${userId},candidate_b_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(20);
  const history: ProfileDebate[] = [];
  if (!historyResult.error) {
    const debates = (historyResult.data ?? []) as ArenaDebate[];
    const promptIds = debates.map((row) => row.prompt_id);
    const opponentIds = debates.map((row) =>
      row.candidate_a_id === userId ? row.candidate_b_id : row.candidate_a_id,
    );
    const prompts = new Map<string, string>();
    if (promptIds.length > 0) {
      const promptResult = await admin.from("debate_prompts").select("id, prompt_text").in("id", promptIds);
      if (!promptResult.error) {
        for (const row of (promptResult.data ?? []) as { id: string; prompt_text: string }[]) {
          prompts.set(row.id, row.prompt_text);
        }
      }
    }
    const opponents = new Map<string, PlatformProfile>();
    const opponentProfiles = await admin
      .from("profiles")
      .select("id, display_name, full_name, legal_name, is_verified, tier2_status")
      .in(
        "id",
        opponentIds.filter((id): id is string => Boolean(id)),
      );
    if (!opponentProfiles.error) {
      for (const row of (opponentProfiles.data ?? []) as {
        id: string;
        display_name: string | null;
        full_name: string | null;
        legal_name: string | null;
        is_verified: boolean;
        tier2_status: string | null;
      }[]) {
        opponents.set(row.id, row as PlatformProfile);
      }
    }
    for (const debate of debates) {
      const ownIsA = debate.candidate_a_id === userId;
      const opponentId = ownIsA ? debate.candidate_b_id : debate.candidate_a_id;
      const opponent = opponentId ? opponents.get(opponentId) : undefined;
      const result = debate.is_tie
        ? "Tie"
        : debate.winner_id === userId
          ? "Win"
          : debate.winner_id
            ? "Loss"
            : "Closed";
      const primary = primaries.get(debate.primary_id);
      history.push({
        id: debate.id,
        prompt: prompts.get(debate.prompt_id) ?? "Open question",
        office: primary?.office_name ?? "Primary",
        ownStance: (ownIsA ? debate.stance_a : debate.stance_b) || "",
        opponentName: opponent ? publicName(opponent) : "Contender",
        result,
        createdAt: debate.created_at,
        candidateAId: debate.candidate_a_id,
        candidateBId: debate.candidate_b_id,
        questions: [],
      });
    }
    try {
      const halls = await loadTownHalls(history.map((debate) => debate.id));
      for (const debate of history) debate.questions = halls.get(debate.id) ?? [];
    } catch {
      // History still renders if Town Hall tables are not applied yet.
    }
  }

  const bioResult = await admin.from("profiles").select("bio").eq("id", userId).maybeSingle();
  const bio = bioResult.error
    ? null
    : ((bioResult.data as { bio?: string | null } | null)?.bio?.trim() || null);
  const chestResult = await admin
    .from("primary_standings")
    .select("primary_id, pledged_war_chest")
    .eq("user_id", userId);
  const chestAmounts = new Map<string, number>();
  if (!chestResult.error) {
    for (const row of (chestResult.data ?? []) as {
      primary_id: string;
      pledged_war_chest: number | string | null;
    }[]) {
      chestAmounts.set(row.primary_id, Number(row.pledged_war_chest ?? 0));
    }
  }
  const warChests: WarChest[] = [...chestAmounts.entries()].map(([primaryId, amount]) => {
    const standing = standings.find((row) => row.primaryId === primaryId);
    const primary = primaries.get(primaryId);
    const seat = primary?.district ? `${primary.state}-${primary.district}` : primary?.state ?? "";
    return {
      primaryId,
      label: standing?.label ?? (primary ? `${seat} · ${primary.office_name}` : "Primary"),
      amount,
    };
  });

  return {
    id: profile.id,
    name: publicName(profile),
    bio,
    tier,
    tierLabel: tierLabel(tier),
    showVerified: tier === "declared_candidate" || tier === "frontrunner",
    avatarUrl: profile.avatar_url,
    ideologyX: profile.ideology_x,
    ideologyY: profile.ideology_y,
    standings,
    warChests,
    history,
  };
}
