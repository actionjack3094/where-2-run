import { releaseExpiredSeats } from "@/lib/actions/debates";
import { primaryClosed, preferCurrentPrimary } from "@/lib/platform/cycle";
import { freezeDuePrimaries } from "@/lib/platform/freeze";
import {
  activeEloField,
  buildPrimaryBoard,
  loadReleasedDonationHrefs,
  normalizeStandingRow,
  tierForPrimaryStanding,
  type StandingRow,
  type StandingSource,
} from "@/lib/actions/tiers";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { matchPrimaries, partyFromCoordinate, type Party } from "@/lib/platform/scoring";
import {
  asTier,
  canRank,
  displayName,
  loadHomeOcdIds,
  loadPrimaries,
  loadProfile,
  loadProfiles,
  ocdMatches,
  platformAdmin,
  schemaMessage,
  type ArenaPublic,
  type PlatformAdmin,
  type PlatformProfile,
} from "@/lib/platform/records";
import type { ArenaCard, BallotComment, BallotMatch, PrimaryHub } from "@/lib/platform/types";
import type { DebatePrompt, Primary } from "@/types/database.types";

const ARENA_PUBLIC =
  "id, primary_id, prompt_id, candidate_a_id, candidate_b_id, stance_a, stance_b, seat_locked_until, status, winner_id, is_tie, created_at";

function side(profile: PlatformProfile | undefined, id: string) {
  return {
    id,
    name: displayName(profile ?? null),
    avatarUrl: profile?.avatar_url ?? null,
    tier: asTier(profile?.candidate_tier),
    verified: canRank(profile ?? {
      id,
      ideology_x: null,
      ideology_y: null,
      onboarding_completed: false,
      is_verified: false,
      tier2_status: null,
      legal_name: null,
      display_name: null,
      full_name: null,
      candidate_tier: "pundit",
      is_synthetic: false,
      synthetic_key: null,
      is_banned: false,
      is_admin: false,
      avatar_url: null,
    }),
    donationHref: null,
  };
}

function card(
  debate: ArenaPublic,
  primary: Primary,
  profiles: Map<string, PlatformProfile>,
  prompt: string,
  distance = 0,
): ArenaCard {
  return {
    id: debate.id,
    primaryId: primary.id,
    primarySlug: primary.slug,
    officeName: primary.office_name,
    party: primary.party === "republican" ? "republican" : "democrat",
    distance,
    prompt,
    stanceA: debate.stance_a,
    sideA: side(profiles.get(debate.candidate_a_id), debate.candidate_a_id),
    sideB: debate.candidate_b_id
      ? side(profiles.get(debate.candidate_b_id), debate.candidate_b_id)
      : null,
    status: debate.status,
    seatLockedUntil: debate.seat_locked_until,
    isTie: debate.is_tie,
    winnerId: debate.winner_id,
  };
}

async function loadOpenCounts(admin: PlatformAdmin, primaryIds: string[]) {
  const counts = new Map<string, number>();
  if (primaryIds.length === 0) return counts;
  const { data, error } = await admin
    .from("arena_debates")
    .select("primary_id, status")
    .in("primary_id", primaryIds)
    .eq("status", "open_challenge");
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  for (const row of (data ?? []) as { primary_id: string }[]) {
    counts.set(row.primary_id, (counts.get(row.primary_id) ?? 0) + 1);
  }
  return counts;
}

export async function loadArenaFeed(userId: string | null) {
  await releaseExpiredSeats();
  const admin = platformAdmin();
  const primaries = await loadPrimaries(admin);
  const profile = userId ? await loadProfile(admin, userId) : null;
  const openCounts = await loadOpenCounts(
    admin,
    primaries.map((primary) => primary.id),
  );

  if (!profile?.onboarding_completed || profile.ideology_x == null || profile.ideology_y == null) {
    return {
      needsDiagnostic: Boolean(userId),
      signedOut: !userId,
      coordinate: null,
      party: null as Party | null,
      cards: [] as ArenaCard[],
    };
  }

  const user = { x: profile.ideology_x, y: profile.ideology_y };
  const matched = matchPrimaries(
    user,
    primaries.map((primary) => ({
      ...primary,
      x: primary.baseline_x,
      y: primary.baseline_y,
      party: primary.party,
      openSeats: openCounts.get(primary.id) ?? 0,
    })),
  );
  const ids = matched.map((row) => row.primary.id);
  if (ids.length === 0) {
    return {
      needsDiagnostic: false,
      signedOut: false,
      coordinate: user,
      party: partyFromCoordinate(user),
      cards: [],
    };
  }

  const { data, error } = await admin
    .from("arena_debates")
    .select(ARENA_PUBLIC)
    .in("primary_id", ids)
    .in("status", ["open_challenge", "active"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  const debates = ((data ?? []) as ArenaPublic[]).filter(
    (debate) => debate.status === "open_challenge" || debate.status === "active",
  );
  const promptIds = debates.map((debate) => debate.prompt_id);
  const prompts = new Map<string, DebatePrompt>();
  if (promptIds.length > 0) {
    const promptResult = await admin
      .from("debate_prompts")
      .select("id, prompt_text")
      .in("id", promptIds);
    if (promptResult.error) throw new Error(promptResult.error.message);
    for (const row of (promptResult.data ?? []) as { id: string; prompt_text: string }[]) {
      prompts.set(row.id, row as DebatePrompt);
    }
  }
  const profiles = await loadProfiles(
    admin,
    debates.flatMap((debate) => [debate.candidate_a_id, debate.candidate_b_id ?? ""]),
  );
  const distanceByPrimary = new Map(matched.map((row) => [row.primary.id, row.distance]));
  const primaryById = new Map(primaries.map((primary) => [primary.id, primary]));
  const cards = debates
    .map((debate) => {
      const primary = primaryById.get(debate.primary_id);
      if (!primary) return null;
      return card(
        debate,
        primary,
        profiles,
        prompts.get(debate.prompt_id)?.prompt_text ?? "Open question",
        distanceByPrimary.get(primary.id) ?? 0,
      );
    })
    .filter((item): item is ArenaCard => item != null)
    .sort((a, b) => a.distance - b.distance);

  return {
    needsDiagnostic: false,
    signedOut: false,
    coordinate: user,
    party: partyFromCoordinate(user),
    cards,
  };
}

export async function loadBallot(userId: string | null) {
  if (!userId) {
    return { signedOut: true, needsAddress: false, matches: [] as BallotMatch[] };
  }
  await releaseExpiredSeats();
  const admin = platformAdmin();
  const home = await loadHomeOcdIds(admin, userId);
  if (home.length === 0) {
    return { signedOut: false, needsAddress: true, matches: [] as BallotMatch[] };
  }
  const primaries = (await loadPrimaries(admin)).filter((primary) =>
    ocdMatches(home, primary.ocd_id),
  );
  if (primaries.length === 0) {
    return { signedOut: false, needsAddress: false, matches: [] };
  }
  const { data, error } = await admin
    .from("arena_debates")
    .select(ARENA_PUBLIC)
    .in(
      "primary_id",
      primaries.map((primary) => primary.id),
    )
    .in("status", ["active", "concluded"])
    .not("candidate_b_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(schemaMessage(error) ?? error.message);
  const debates = ((data ?? []) as ArenaPublic[]).filter(
    (debate) =>
      debate.candidate_b_id && (debate.status === "active" || debate.status === "concluded"),
  );
  const profiles = await loadProfiles(
    admin,
    debates.flatMap((debate) => [debate.candidate_a_id, debate.candidate_b_id ?? ""]),
  );
  const standingResult = await admin
    .from("primary_standings")
    .select(
      "user_id, primary_id, civic_standing, ties, debates_count, debates_logged, policy_consistency",
    )
    .in(
      "primary_id",
      primaries.map((primary) => primary.id),
    );
  if (standingResult.error) {
    throw new Error(schemaMessage(standingResult.error) ?? standingResult.error.message);
  }
  const standingRows = (standingResult.data ?? []) as (StandingRow & { primary_id: string })[];
  const standingsByPrimary = new Map<string, StandingRow[]>();
  for (const row of standingRows) {
    const list = standingsByPrimary.get(row.primary_id) ?? [];
    list.push(row);
    standingsByPrimary.set(row.primary_id, list);
  }
  const standingProfiles = await loadProfiles(
    admin,
    standingRows.map((row) => row.user_id),
  );
  for (const [id, profile] of profiles) standingProfiles.set(id, profile);
  const promptIds = debates.map((debate) => debate.prompt_id);
  const promptText = new Map<string, string>();
  if (promptIds.length > 0) {
    const promptResult = await admin.from("debate_prompts").select("id, prompt_text").in("id", promptIds);
    if (promptResult.error) throw new Error(promptResult.error.message);
    for (const row of (promptResult.data ?? []) as { id: string; prompt_text: string }[]) {
      promptText.set(row.id, row.prompt_text);
    }
  }
  const debateIds = debates.map((debate) => debate.id);
  const likeRows: { debate_id: string; user_id: string; supported_id: string }[] = [];
  if (debateIds.length > 0) {
    const likes = await admin
      .from("debate_likes")
      .select("debate_id, user_id, supported_id")
      .in("debate_id", debateIds);
    if (likes.error) throw new Error(schemaMessage(likes.error) ?? likes.error.message);
    likeRows.push(
      ...((likes.data ?? []) as { debate_id: string; user_id: string; supported_id: string }[]),
    );
  }
  const likerProfiles = await loadProfiles(
    admin,
    likeRows.map((row) => row.user_id),
  );
  const homeByUser = new Map<string, string[]>();
  const likerIds = [...new Set(likeRows.map((row) => row.user_id))];
  if (likerIds.length > 0) {
    const homes = await admin.from("users").select("id, home_ocd_ids").in("id", likerIds);
    if (homes.error && !isMissingSchema(homes.error)) throw new Error(homes.error.message);
    for (const row of (homes.data ?? []) as { id: string; home_ocd_ids: string[] | null }[]) {
      homeByUser.set(
        row.id,
        (row.home_ocd_ids ?? []).map((id) => normalizeOcdId(id)),
      );
    }
  }
  const commentsResult =
    debateIds.length === 0
      ? { data: [], error: null }
      : await admin
          .from("debate_comments")
          .select("id, debate_id, author_id, body, created_at")
          .in("debate_id", debateIds)
          .order("created_at", { ascending: true });
  if (commentsResult.error) {
    throw new Error(schemaMessage(commentsResult.error) ?? commentsResult.error.message);
  }
  const commentRows = (commentsResult.data ?? []) as {
    id: string;
    debate_id: string;
    author_id: string;
    body: string;
    created_at: string;
  }[];
  const commentProfiles = await loadProfiles(
    admin,
    commentRows.map((row) => row.author_id),
  );
  const primaryById = new Map(primaries.map((primary) => [primary.id, primary]));
  const donationHrefs = await loadReleasedDonationHrefs(
    admin,
    debates.flatMap((debate) => [debate.candidate_a_id, debate.candidate_b_id ?? ""]),
  );
  const chestBySeat = new Map<string, number>();
  const chestResult = await admin
    .from("primary_standings")
    .select("user_id, primary_id, pledged_war_chest")
    .in(
      "primary_id",
      primaries.map((primary) => primary.id),
    );
  if (!chestResult.error) {
    for (const row of (chestResult.data ?? []) as {
      user_id: string;
      primary_id: string;
      pledged_war_chest: number | string | null;
    }[]) {
      chestBySeat.set(`${row.user_id}:${row.primary_id}`, Number(row.pledged_war_chest ?? 0));
    }
  } else if (!isMissingSchema(chestResult.error)) {
    throw new Error(chestResult.error.message);
  }
  const enlistedSeats = new Set<string>();
  if (userId) {
    const enlistments = await admin
      .from("volunteer_signups")
      .select("campaign_user_id, primary_id")
      .eq("volunteer_user_id", userId);
    if (!enlistments.error) {
      for (const row of (enlistments.data ?? []) as { campaign_user_id: string; primary_id: string }[]) {
        enlistedSeats.add(`${row.campaign_user_id}:${row.primary_id}`);
      }
    } else if (!isMissingSchema(enlistments.error)) {
      throw new Error(enlistments.error.message);
    }
  }

  const matches = debates.map((debate) => {
    const primary = primaryById.get(debate.primary_id);
    const rows = standingsByPrimary.get(debate.primary_id) ?? [];
    const field = activeEloField(rows, standingProfiles);
    const seat = (id: string) => {
      const profile = standingProfiles.get(id) ?? profiles.get(id);
      const base = side(profile, id);
      const standing = rows.find((row) => row.user_id === id);
      const tier = standing ? tierForPrimaryStanding(standing, profile, field) : "pundit" as const;
      return {
        ...base,
        tier,
        donationHref: tier === "frontrunner" ? (donationHrefs.get(id) ?? null) : null,
      };
    };
    const sideA = seat(debate.candidate_a_id);
    const sideB = seat(debate.candidate_b_id ?? "");
    const localLikes = likeRows.filter((like) => {
      if (like.debate_id !== debate.id || !primary) return false;
      const liker = likerProfiles.get(like.user_id);
      if (!liker || !(liker.is_verified || liker.tier2_status === "verified")) return false;
      return ocdMatches(homeByUser.get(like.user_id) ?? [], primary.ocd_id);
    });
    const tally = new Map<string, number>();
    for (const like of localLikes) {
      tally.set(like.supported_id, (tally.get(like.supported_id) ?? 0) + 1);
    }
    let crowd: BallotMatch["crowd"] = null;
    if (localLikes.length > 0) {
      const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      const [leaderId, leaderCount] = ranked[0];
      const tied = ranked[1] && ranked[1][1] === leaderCount;
      if (!tied) {
        const leader = leaderId === sideA.id ? sideA : sideB;
        crowd = {
          name: leader.name,
          percent: Math.round((leaderCount / localLikes.length) * 100),
        };
      }
    }
    const comments: BallotComment[] = commentRows
      .filter((row) => row.debate_id === debate.id)
      .map((row) => ({
        id: row.id,
        author: displayName(commentProfiles.get(row.author_id) ?? null),
        body: row.body,
        createdAt: row.created_at,
      }));
    const priority = sideA.tier === "frontrunner" || sideB.tier === "frontrunner";
    const primaryId = debate.primary_id;
    return {
      id: debate.id,
      primaryId,
      primarySlug: primary?.slug ?? "",
      officeName: primary?.office_name ?? "Primary",
      state: primary?.state ?? "",
      district: primary?.district ?? null,
      prompt: promptText.get(debate.prompt_id) ?? "Open question",
      stanceA: debate.stance_a,
      stanceB: debate.stance_b,
      sideA,
      sideB,
      status: debate.status,
      isTie: debate.is_tie,
      winnerId: debate.winner_id,
      crowd,
      priority,
      comments,
      viewerSupportId: likeRows.find((like) => like.debate_id === debate.id && like.user_id === userId)
        ?.supported_id ?? null,
      warChestA: chestBySeat.get(`${sideA.id}:${primaryId}`) ?? 0,
      warChestB: chestBySeat.get(`${sideB.id}:${primaryId}`) ?? 0,
      enlistedA: enlistedSeats.has(`${sideA.id}:${primaryId}`),
      enlistedB: enlistedSeats.has(`${sideB.id}:${primaryId}`),
    } satisfies BallotMatch;
  });

  matches.sort((a, b) => Number(b.priority) - Number(a.priority));
  return { signedOut: false, needsAddress: false, matches };
}

export async function loadPrimaryHub(slug: string): Promise<PrimaryHub | null> {
  try {
    await freezeDuePrimaries();
  } catch (caught) {
    console.error(
      "freezeDuePrimaries failed.",
      caught instanceof Error ? caught.message : "Could not freeze a primary.",
    );
  }
  await releaseExpiredSeats();
  const admin = platformAdmin();
  const primaries = await loadPrimaries(admin);
  const primary = preferCurrentPrimary(primaries, slug);
  if (!primary) return null;
  const party: Party | "nonpartisan" =
    primary.party === "republican"
      ? "republican"
      : primary.party === "nonpartisan"
        ? "nonpartisan"
        : "democrat";
  const sibling = [...primaries]
    .filter((row) => row.general_slug === primary.general_slug && row.id !== primary.id && row.party !== primary.party)
    .sort((a, b) => (b.cycle_year ?? 0) - (a.cycle_year ?? 0))[0];
  const standingSelect =
    "user_id, civic_standing, ties, debates_count, debates_logged, policy_consistency, is_nominee";
  const fullStandings = await admin
    .from("primary_standings")
    .select(standingSelect)
    .eq("primary_id", primary.id)
    .order("civic_standing", { ascending: false });
  let standingRows: StandingSource[] = [];
  if (!fullStandings.error) {
    standingRows = (fullStandings.data ?? []) as StandingSource[];
  } else if (isMissingSchema(fullStandings.error)) {
    const legacy = await (admin.from("primary_standings") as unknown as {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: StandingSource[] | null; error: { message: string } | null }>;
      };
    })
      .select("user_id, elo, wins, losses, ties, debates_count")
      .eq("primary_id", primary.id);
    if (legacy.error) throw new Error(schemaMessage(legacy.error) ?? legacy.error.message);
    standingRows = legacy.data ?? [];
  } else {
    throw new Error(schemaMessage(fullStandings.error) ?? fullStandings.error.message);
  }
  const standings = standingRows.map((row) => ({
    ...normalizeStandingRow(row),
    is_nominee: Boolean(row.is_nominee),
  }));
  const profiles = await loadProfiles(
    admin,
    standings.map((row) => row.user_id),
  );
  const board = buildPrimaryBoard(standings, profiles);

  const { data: openRows, error: openError } = await admin
    .from("arena_debates")
    .select(ARENA_PUBLIC)
    .eq("primary_id", primary.id)
    .eq("status", "open_challenge")
    .order("created_at", { ascending: false });
  if (openError) throw new Error(schemaMessage(openError) ?? openError.message);
  const open = (openRows ?? []) as ArenaPublic[];
  const openProfiles = await loadProfiles(
    admin,
    open.map((row) => row.candidate_a_id),
  );
  const promptResult =
    open.length === 0
      ? { data: [], error: null }
      : await admin
          .from("debate_prompts")
          .select("id, prompt_text")
          .in(
            "id",
            open.map((row) => row.prompt_id),
          );
  if (promptResult.error) throw new Error(promptResult.error.message);
  const prompts = new Map(
    ((promptResult.data ?? []) as { id: string; prompt_text: string }[]).map((row) => [
      row.id,
      row.prompt_text,
    ]),
  );

  return {
    id: primary.id,
    slug: primary.slug,
    party,
    officeName: primary.office_name,
    state: primary.state,
    district: primary.district,
    level: primary.level === "state" || primary.level === "local" ? primary.level : "federal",
    ocdId: primary.ocd_id,
    baselineX: primary.baseline_x,
    baselineY: primary.baseline_y,
    generalSlug: primary.general_slug,
    cycleYear: primary.cycle_year,
    primaryDate: primary.primary_date,
    status: primary.status,
    closed: primaryClosed(primary),
    counterpartySlug: sibling?.slug ?? null,
    counterpartyParty: sibling?.party ?? null,
    leaderboard: board.ranked,
    unranked: board.unranked,
    openSeats: open.map((debate) =>
      card(debate, primary, openProfiles, prompts.get(debate.prompt_id) ?? "Open question"),
    ),
  };
}

export async function loadPrimaryIndex() {
  const admin = platformAdmin();
  const primaries = await loadPrimaries(admin);
  const groups = new Map<string, Primary[]>();
  for (const primary of primaries) {
    const list = groups.get(primary.general_slug) ?? [];
    list.push(primary);
    groups.set(primary.general_slug, list);
  }
  return [...groups.entries()].map(([generalSlug, rows]) => ({
    generalSlug,
    primaries: rows.sort((a, b) => a.party.localeCompare(b.party)),
  }));
}
