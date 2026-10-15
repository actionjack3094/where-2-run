import { countVerifiedInDistrictUpvotes } from "@/lib/campaign/load-unlocks";
import { isUuid } from "@/lib/arena/display";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import {
  alignmentToPrimary,
  floorStatus,
  inDistrict,
  primaryDistrictBadge,
  rebuttalFor,
  resolveClashWindow,
  type ClashWindow,
  type FloorStatus,
} from "@/lib/debates/clash-room";
import { displayName, loadHomeOcdIds, loadProfiles, platformAdmin, type PlatformAdmin, type PlatformProfile } from "@/lib/platform/records";

export type ClashParticipantView = {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: FloorStatus;
  alignment: number | null;
  opening: string;
  rebuttal: string | null;
  resonance: number;
};

export type ClashAnswerView = {
  id: string;
  candidateId: string;
  candidateName: string;
  content: string;
};

export type ClashQuestionView = {
  id: string;
  voterName: string;
  content: string;
  upvotes: number;
  viewerUpvoted: boolean;
  answers: ClashAnswerView[];
};

export type ClashRoomView = {
  id: string;
  badge: string;
  prompt: string;
  window: ClashWindow;
  rebuttalExpiresAt: string | null;
  sideA: ClashParticipantView;
  sideB: ClashParticipantView | null;
  viewerId: string | null;
  viewerInDistrict: boolean;
  canAsk: boolean;
  questions: ClashQuestionView[];
};

const FULL_COLUMNS =
  "id, primary_id, prompt_id, candidate_a_id, candidate_b_id, stance_a, stance_b, status, clash_stage, rebuttal_expires_at, seat_locked_until, round_transcript";

const BASE_COLUMNS =
  "id, primary_id, prompt_id, candidate_a_id, candidate_b_id, stance_a, stance_b, status, seat_locked_until";

type DebateRow = {
  id: string;
  primary_id: string;
  prompt_id: string;
  candidate_a_id: string;
  candidate_b_id: string | null;
  stance_a: string;
  stance_b: string | null;
  status: string;
  clash_stage?: string | null;
  rebuttal_expires_at?: string | null;
  seat_locked_until?: string | null;
  round_transcript?: unknown;
};

export async function viewerIsInDistrict(userId: string, ocdId: string | null) {
  const admin = platformAdmin();
  const [profile, zips, home] = await Promise.all([
    loadViewer(admin, userId),
    zipsForOcd(admin, ocdId),
    loadHomeOcdIds(admin, userId).catch(() => [] as string[]),
  ]);
  const verified = profile?.is_verified === true || profile?.tier2_status === "verified";
  return inDistrict({
    verified,
    votingZip: profile?.voting_zip_code,
    districtZips: zips,
    homeOcdIds: mergeHome(home, profile?.ocd_ids),
    primaryOcdId: ocdId,
  });
}

export async function loadClashRoom(debateId: string): Promise<ClashRoomView | null> {
  if (!isUuid(debateId)) return null;
  try {
    const admin = platformAdmin();
    const debate = await loadDebate(admin, debateId);
    if (!debate) return null;

    const [promptResult, primaryResult, user] = await Promise.all([
      admin.from("debate_prompts").select("prompt_text").eq("id", debate.prompt_id).maybeSingle(),
      admin
        .from("primaries")
        .select("office_name, state, district, ocd_id, baseline_x, baseline_y")
        .eq("id", debate.primary_id)
        .maybeSingle(),
      getServerUser(),
    ]);

    const primary = primaryResult.error
      ? null
      : (primaryResult.data as {
          office_name?: string;
          state?: string;
          district?: string | null;
          ocd_id?: string;
          baseline_x?: number;
          baseline_y?: number;
        } | null);
    const promptText = promptResult.error
      ? ""
      : ((promptResult.data as { prompt_text?: string } | null)?.prompt_text?.trim() ?? "");

    const expiresAt = debate.rebuttal_expires_at ?? debate.seat_locked_until ?? null;
    const stage =
      debate.clash_stage ??
      (debate.status === "concluded" || debate.status === "cancelled"
        ? "closed"
        : debate.status === "active"
          ? "rebuttal"
          : "opening");
    const window = resolveClashWindow({ clashStage: stage, rebuttalExpiresAt: expiresAt });
    const ocdId = primary?.ocd_id ?? null;
    const baseline = {
      x: Number(primary?.baseline_x ?? 0),
      y: Number(primary?.baseline_y ?? 0),
    };
    const transcript = debate.round_transcript;

    const ids = [debate.candidate_a_id, debate.candidate_b_id].filter((id): id is string => Boolean(id));
    const [profiles, resonance, questions, districtZips, viewerHome, filed] = await Promise.all([
      loadProfiles(admin, ids),
      resonanceCounts(admin, debate.id, ocdId, ids),
      loadQuestions(admin, debate.id, user?.id ?? null),
      zipsForOcd(admin, ocdId),
      user?.id ? loadHomeOcdIds(admin, user.id).catch(() => [] as string[]) : Promise.resolve([] as string[]),
      filedFlags(admin, ids, debate.primary_id),
    ]);

    const viewerProfile = user?.id ? await loadViewer(admin, user.id) : null;
    const verified = viewerProfile?.is_verified === true || viewerProfile?.tier2_status === "verified";
    const home = mergeHome(viewerHome, viewerProfile?.ocd_ids);
    const viewerInside = inDistrict({
      verified,
      votingZip: viewerProfile?.voting_zip_code,
      districtZips,
      homeOcdIds: home,
      primaryOcdId: ocdId,
    });
    const seated =
      user?.id != null && (user.id === debate.candidate_a_id || user.id === debate.candidate_b_id);
    const alreadyAsked = user?.id != null && questions.voterIds.has(user.id);

    const side = (id: string, opening: string): ClashParticipantView => {
      const profile = profiles.get(id) ?? null;
      return {
        id,
        name: publicName(profile),
        avatarUrl: profile?.avatar_url ?? null,
        status: floorStatus({
          inDistrictVotes: resonance.career.get(id) ?? 0,
          filed: filed.get(id) === true,
        }),
        alignment: alignmentToPrimary(
          profile ? { x: profile.ideology_x, y: profile.ideology_y } : null,
          baseline,
        ),
        opening: opening.trim(),
        rebuttal: rebuttalFor(transcript, id),
        resonance: resonance.onDebate.get(id) ?? 0,
      };
    };

    return {
      id: debate.id,
      badge: primaryDistrictBadge({
        officeName: primary?.office_name ?? "Primary",
        state: primary?.state,
        district: primary?.district,
        ocdId,
      }),
      prompt: promptText || "Open question",
      window,
      rebuttalExpiresAt: window === "opening" ? null : expiresAt,
      sideA: side(debate.candidate_a_id, debate.stance_a),
      sideB: debate.candidate_b_id ? side(debate.candidate_b_id, debate.stance_b ?? "") : null,
      viewerId: user?.id ?? null,
      viewerInDistrict: viewerInside,
      canAsk: window !== "locked" && viewerInside && !seated && !alreadyAsked,
      questions: questions.rows,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (/service role|Missing NEXT_PUBLIC/i.test(message) || isMissingSchema({ message })) return null;
    throw caught;
  }
}

async function loadDebate(admin: PlatformAdmin, debateId: string) {
  const full = await admin.from("arena_debates").select(FULL_COLUMNS).eq("id", debateId).maybeSingle();
  if (!full.error) return (full.data as DebateRow | null) ?? null;
  if (!isMissingSchema(full.error)) throw new Error(full.error.message);
  const base = await admin.from("arena_debates").select(BASE_COLUMNS).eq("id", debateId).maybeSingle();
  if (base.error) {
    if (isMissingSchema(base.error)) return null;
    throw new Error(base.error.message);
  }
  return (base.data as DebateRow | null) ?? null;
}

async function loadViewer(admin: PlatformAdmin, userId: string) {
  const result = await admin
    .from("profiles")
    .select("is_verified, tier2_status, voting_zip_code, ocd_ids")
    .eq("id", userId)
    .maybeSingle();
  if (result.error) {
    if (isMissingSchema(result.error)) return null;
    return null;
  }
  return result.data as {
    is_verified?: boolean | null;
    tier2_status?: string | null;
    voting_zip_code?: string | null;
    ocd_ids?: string[] | null;
  } | null;
}

function mergeHome(home: string[], ocdIds: string[] | null | undefined) {
  return [...new Set([...home, ...(Array.isArray(ocdIds) ? ocdIds : [])].map((id) => normalizeOcdId(id)).filter(Boolean))];
}

function publicName(profile: PlatformProfile | null) {
  const legal = profile?.is_verified && profile.legal_name?.trim();
  return legal || displayName(profile);
}

function voterLabel(profile: PlatformProfile | null) {
  const name = publicName(profile);
  return name === "Contender" ? "Constituent" : name;
}

async function zipsForOcd(admin: PlatformAdmin, ocdId: string | null) {
  const raw = (ocdId ?? "").trim();
  const target = normalizeOcdId(ocdId);
  if (!target) return [];
  const result = await admin
    .from("districts")
    .select("zip_code, ocd_id")
    .in("ocd_id", [...new Set([raw, target])]);
  if (result.error || !result.data) return [];
  return (result.data as { zip_code: string | null }[])
    .map((row) => row.zip_code)
    .filter((zip): zip is string => Boolean(zip));
}

async function filedFlags(admin: PlatformAdmin, ids: string[], primaryId: string) {
  const flags = new Map<string, boolean>();
  if (ids.length === 0) return flags;
  const standing = await admin
    .from("primary_standings")
    .select("user_id, is_nominee")
    .eq("primary_id", primaryId)
    .in("user_id", ids);
  if (!standing.error) {
    for (const row of (standing.data ?? []) as { user_id: string; is_nominee?: boolean | null }[]) {
      if (row.is_nominee) flags.set(row.user_id, true);
    }
  }
  const targets = await admin
    .from("campaign_targets")
    .select("user_id, status, official_candidate_id")
    .in("user_id", ids);
  if (!targets.error) {
    for (const row of (targets.data ?? []) as {
      user_id: string;
      status?: string | null;
      official_candidate_id?: string | null;
    }[]) {
      if (row.status === "filed" || Boolean(row.official_candidate_id?.trim())) flags.set(row.user_id, true);
    }
  }
  return flags;
}

async function resonanceCounts(
  admin: PlatformAdmin,
  debateId: string,
  ocdId: string | null,
  candidateIds: string[],
) {
  const onDebate = new Map<string, number>();
  const career = new Map<string, number>();
  const likes = await admin.from("debate_likes").select("user_id, supported_id").eq("debate_id", debateId);
  const rows = likes.error
    ? []
    : ((likes.data ?? []) as { user_id: string; supported_id: string }[]);
  const qualified = await qualifiedIds(
    admin,
    rows.map((row) => row.user_id),
    ocdId,
  );
  for (const row of rows) {
    if (!qualified.has(row.user_id) || row.user_id === row.supported_id) continue;
    onDebate.set(row.supported_id, (onDebate.get(row.supported_id) ?? 0) + 1);
  }

  await Promise.all(
    candidateIds.map(async (id) => {
      try {
        career.set(id, await countVerifiedInDistrictUpvotes(admin, id, ocdId));
      } catch {
        career.set(id, onDebate.get(id) ?? 0);
      }
    }),
  );
  return { onDebate, career };
}

async function qualifiedIds(admin: PlatformAdmin, voterIds: string[], ocdId: string | null) {
  const qualified = new Set<string>();
  const unique = [...new Set(voterIds.filter(Boolean))];
  if (unique.length === 0 || !ocdId) return qualified;
  const zips = await zipsForOcd(admin, ocdId);
  const profiles = await admin
    .from("profiles")
    .select("id, is_verified, tier2_status, voting_zip_code, ocd_ids")
    .in("id", unique);
  const rows = profiles.error
    ? []
    : ((profiles.data ?? []) as {
        id: string;
        is_verified?: boolean | null;
        tier2_status?: string | null;
        voting_zip_code?: string | null;
        ocd_ids?: string[] | null;
      }[]);
  const needHome = rows.filter((row) => !Array.isArray(row.ocd_ids) || row.ocd_ids.length === 0).map((row) => row.id);
  const homes = new Map<string, string[]>();
  if (needHome.length > 0) {
    const users = await admin.from("users").select("id, home_ocd_ids").in("id", needHome);
    if (!users.error) {
      for (const row of (users.data ?? []) as { id: string; home_ocd_ids?: string[] | null }[]) {
        homes.set(row.id, Array.isArray(row.home_ocd_ids) ? row.home_ocd_ids : []);
      }
    }
  }
  for (const row of rows) {
    const verified = row.is_verified === true || row.tier2_status === "verified";
    const home = [...(Array.isArray(row.ocd_ids) ? row.ocd_ids : []), ...(homes.get(row.id) ?? [])];
    if (
      inDistrict({
        verified,
        votingZip: row.voting_zip_code,
        districtZips: zips,
        homeOcdIds: home,
        primaryOcdId: ocdId,
      })
    ) {
      qualified.add(row.id);
    }
  }
  return qualified;
}

async function loadQuestions(admin: PlatformAdmin, debateId: string, viewerId: string | null) {
  const empty = { rows: [] as ClashQuestionView[], voterIds: new Set<string>() };
  const questions = await admin
    .from("constituent_questions")
    .select("id, voter_id, content, created_at")
    .eq("debate_id", debateId)
    .order("created_at", { ascending: true });
  if (questions.error) return empty;
  const questionRows = (questions.data ?? []) as {
    id: string;
    voter_id: string;
    content: string;
  }[];
  const voterIds = new Set(questionRows.map((row) => row.voter_id));
  const questionIds = questionRows.map((row) => row.id);
  const [answers, votes, names] = await Promise.all([
    questionIds.length
      ? admin
          .from("candidate_answers")
          .select("id, question_id, candidate_id, content")
          .in("question_id", questionIds)
      : Promise.resolve({ data: [], error: null }),
    questionIds.length
      ? admin.from("constituent_question_votes").select("question_id, voter_id").in("question_id", questionIds)
      : Promise.resolve({ data: [], error: null }),
    loadProfiles(admin, questionRows.map((row) => row.voter_id)),
  ]);
  const answerRows = answers.error
    ? []
    : ((answers.data ?? []) as {
        id: string;
        question_id: string;
        candidate_id: string;
        content: string;
      }[]);
  const voteRows = votes.error
    ? []
    : ((votes.data ?? []) as { question_id: string; voter_id: string }[]);
  const answerProfiles = await loadProfiles(
    admin,
    answerRows.map((row) => row.candidate_id),
  );
  const upvotes = new Map<string, number>();
  const mine = new Set<string>();
  for (const vote of voteRows) {
    upvotes.set(vote.question_id, (upvotes.get(vote.question_id) ?? 0) + 1);
    if (viewerId && vote.voter_id === viewerId) mine.add(vote.question_id);
  }
  const answersByQuestion = new Map<string, ClashAnswerView[]>();
  for (const row of answerRows) {
    const list = answersByQuestion.get(row.question_id) ?? [];
    list.push({
      id: row.id,
      candidateId: row.candidate_id,
      candidateName: publicName(answerProfiles.get(row.candidate_id) ?? null),
      content: row.content,
    });
    answersByQuestion.set(row.question_id, list);
  }
  return {
    voterIds,
    rows: questionRows.map((row) => ({
      id: row.id,
      voterName: voterLabel(names.get(row.voter_id) ?? null),
      content: row.content,
      upvotes: upvotes.get(row.id) ?? 0,
      viewerUpvoted: mine.has(row.id),
      answers: answersByQuestion.get(row.id) ?? [],
    })),
  };
}
