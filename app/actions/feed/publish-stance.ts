"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { ELECTION_LINK_COLUMNS } from "@/lib/election-links";
import {
  assignStanceToElection,
  inferJurisdiction,
  inferKeywords,
  pickElectionId,
  type ElectionCatalogRow,
} from "@/lib/feed/assign-election";
import { applyIdeologyEma, calibrationVector } from "@/lib/feed/ema";
import { firstClaim, htmlToPlainText, sanitizeRichText } from "@/lib/feed/html";
import { IDEOLOGY_EMA_ALPHA } from "@/lib/feed/types";
import { formatCivicVector, buildCivicIdeologyVector } from "@/lib/ideology/civic-vector";
import {
  SIX_AXIS_IDS,
  formatSixAxisVector,
  type SixAxisId,
  type SixAxisVector,
} from "@/lib/ideology/six-axis";
import { formatPgIdeologyVector } from "@/lib/ideology/vector";
import { isMissingStanceColumn } from "@/lib/ideology/stance";
import type { CivicStance, Election } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

export type PublishStanceMode = "custom" | "calibration";

export type PublishStanceInput = {
  mode: PublishStanceMode;
  body?: string;
  claim?: string;
  promptId?: string;
  promptText?: string;
  choiceId?: string;
  choiceLabel?: string;
  choiceScore?: number;
  axisId?: SixAxisId;
  electionId?: string | null;
};

export type PublishStanceResult = {
  ok: true;
  debateId: string | null;
  postId: string | null;
  electionId: string | null;
  electionName: string | null;
  keywords: string[];
};

function isSixAxisId(value: string | undefined): value is SixAxisId {
  return Boolean(value && (SIX_AXIS_IDS as readonly string[]).includes(value));
}

function isMissingRpc(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    /update_ideology_vector_ema/i.test(message) ||
    /schema cache/i.test(message)
  );
}

async function ensurePublicUser(admin: AdminClient, userId: string) {
  const { data: existing, error } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (existing) return;

  const username = `runner-${userId.slice(0, 6)}`;
  const { error: insertError } = await admin.from("users").insert({
    id: userId,
    username,
  });
  if (insertError) throw new Error(insertError.message);
}

async function loadTopMatchedElectionId(
  admin: AdminClient,
  userId: string,
  elections: ElectionCatalogRow[],
  preferredDistrictId: string | null,
) {
  const { data, error } = await admin
    .from("electability_scores")
    .select("district_id, ideological_match_pct, electability_multiplier")
    .eq("user_id", userId);

  const rows = (data ?? []) as Array<{
    district_id: string;
    ideological_match_pct: number | string | null;
    electability_multiplier: number | string | null;
  }>;

  if (error) {
    if (!isMissingRelation(error)) {
      console.warn("Could not load matched elections.", error.message);
    }
  } else if (rows.length) {
    const ranked = [...rows].sort((left, right) => {
      const electability =
        Number(right.electability_multiplier) - Number(left.electability_multiplier);
      if (electability !== 0) return electability;
      return Number(right.ideological_match_pct) - Number(left.ideological_match_pct);
    });

    for (const row of ranked) {
      const match = elections.find((election) => election.district_id === row.district_id);
      if (match) return match.id;
    }
  }

  if (preferredDistrictId) {
    return elections.find((row) => row.district_id === preferredDistrictId)?.id ?? null;
  }

  return null;
}

async function loadElectionCatalog(admin: AdminClient) {
  const { data, error } = await admin
    .from("elections")
    .select(`${ELECTION_LINK_COLUMNS}, filing_requirements`);
  if (error) {
    if (isMissingRelation(error)) return [] as ElectionCatalogRow[];
    throw new Error(error.message);
  }
  return (data ?? []) as ElectionCatalogRow[];
}

async function applyVectorEma(
  admin: AdminClient,
  userId: string,
  stanceVector: SixAxisVector,
) {
  const { error } = await admin.rpc("update_ideology_vector_ema", {
    p_user_id: userId,
    p_stance_vector: formatSixAxisVector(stanceVector),
    p_alpha: IDEOLOGY_EMA_ALPHA,
  });

  if (!error) return;

  if (!isMissingRpc(error) && !isMissingStanceColumn(error)) {
    console.warn("Ideology EMA RPC failed; applying local EMA.", error.message);
  }

  const { data: profile } = await admin
    .from("users")
    .select("ideology_vector")
    .eq("id", userId)
    .maybeSingle();

  const next = applyIdeologyEma(profile?.ideology_vector, stanceVector, IDEOLOGY_EMA_ALPHA);
  const { error: updateError } = await admin
    .from("users")
    .update({
      ideology_vector: formatPgIdeologyVector(next.ten),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError && !isMissingStanceColumn(updateError)) {
    throw new Error(updateError.message);
  }
}

export async function publishStance(
  input: PublishStanceInput,
  accessToken?: string | null,
): Promise<PublishStanceResult> {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to publish a stance.");

  const admin = createAdminClient();
  await ensurePublicUser(admin, userId);

  const { data: profile } = await admin
    .from("users")
    .select("residency_state, target_district_id")
    .eq("id", userId)
    .maybeSingle();

  const elections = await loadElectionCatalog(admin);
  const mode = input.mode === "calibration" ? "calibration" : "custom";

  let topic: string;
  let argument: string;
  let civicStance: CivicStance;
  let keywords: string[] = [];
  let electionId: string | null = null;
  let debateId: string | null = null;
  let stanceVector = calibrationVector(3, 0.5);

  if (mode === "custom") {
    const rich = sanitizeRichText(input.body ?? "");
    argument = htmlToPlainText(rich);
    if (argument.length < 48) {
      throw new Error("Write a fuller policy argument before publishing.");
    }
    topic = input.claim?.trim() || firstClaim(argument, "District policy stance");
    const assignment = await assignStanceToElection(`${topic}\n${argument}`, elections, {
      userState: profile?.residency_state ?? null,
      preferredDistrictId: profile?.target_district_id ?? null,
    });
    if (!input.claim?.trim() && assignment.topic) topic = assignment.topic;
    keywords = assignment.keywords;
    const requestedId = input.electionId?.trim() || null;
    const explicit =
      requestedId && elections.some((row) => row.id === requestedId) ? requestedId : null;
    if (explicit) {
      electionId = explicit;
    } else if (assignment.ambiguous) {
      electionId =
        (await loadTopMatchedElectionId(
          admin,
          userId,
          elections,
          profile?.target_district_id ?? null,
        )) ?? assignment.electionId;
    } else {
      electionId = assignment.electionId;
    }
    civicStance = "Affirmative";
    stanceVector = assignment.vector;
  } else {
    const axisId = isSixAxisId(input.axisId) ? input.axisId : "economy";
    const axisIndex = Math.max(0, SIX_AXIS_IDS.indexOf(axisId));
    const score = Number.isFinite(input.choiceScore) ? Number(input.choiceScore) : 0.5;
    topic = input.claim?.trim() || input.promptText?.trim() || "Quick calibration";
    argument = input.choiceLabel?.trim() || "Filed a calibration stance.";
    civicStance = score >= 0.5 ? "Affirmative" : "Negative";
    stanceVector = calibrationVector(axisIndex, score);
    const haystack = `${topic}\n${argument}`;
    keywords = inferKeywords(haystack);
    electionId = pickElectionId(elections, {
      jurisdiction: inferJurisdiction(haystack),
      geography: profile?.residency_state ? [profile.residency_state] : [],
      keywords,
      userState: profile?.residency_state ?? null,
      preferredDistrictId: profile?.target_district_id ?? null,
    });
  }

  const election =
    (elections.find((row) => row.id === electionId) as
      | (ElectionCatalogRow & Pick<Election, "filing_requirements">)
      | undefined) ?? null;
  const districtId = election?.district_id ?? profile?.target_district_id ?? null;
  const districtLabel = election?.office_name ?? districtId ?? "Austin City Council - District 9";

  let postId: string | null = null;

  if (mode === "calibration") {
    const civicIdeology = formatCivicVector(
      buildCivicIdeologyVector(topic, argument, civicStance),
    );
    const { data: post, error: postError } = await admin
      .from("civic_posts")
      .insert({
        author_id: userId,
        district_id: districtId ?? districtLabel,
        claim: topic,
        stance: civicStance,
        argument,
        ideology_vector: civicIdeology,
        status: "open",
      })
      .select("id")
      .maybeSingle();

    if (postError && !isMissingRelation(postError)) {
      throw new Error(postError.message);
    }
    postId = post?.id ?? null;
  }

  if (mode === "custom") {
    const { data: debate, error: debateError } = await admin
      .from("debates")
      .insert({
        topic,
        district_id: districtId,
        election_id: electionId,
        candidate_a_id: userId,
        status: "matching",
        current_round: 1,
      })
      .select("id")
      .single();

    if (debateError || !debate) {
      throw new Error(debateError?.message ?? "Could not open a debate for this stance.");
    }

    debateId = debate.id;

    const { error: argumentError } = await admin.from("arguments").insert({
      debate_id: debate.id,
      author_id: userId,
      round_number: 1,
      content: argument,
    });
    if (argumentError && !isMissingRelation(argumentError)) {
      console.warn("Could not store the opening argument.", argumentError.message);
    }
  }

  await applyVectorEma(admin, userId, stanceVector);

  revalidatePath("/feed");
  if (election?.slug) revalidatePath(`/elections/${election.slug}`);
  if (debateId) revalidatePath(`/debates/${debateId}`);
  revalidatePath(`/profile/${userId}`);

  return {
    ok: true,
    debateId,
    postId,
    electionId,
    electionName: election?.office_name ?? null,
    keywords,
  };
}
