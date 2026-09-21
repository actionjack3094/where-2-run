"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import {
  COALITION_CHARTER_MAX,
  COALITION_CHARTER_MIN,
  COALITION_NAME_MAX,
  isMissingRelation,
} from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import type { Coalition, CoalitionMember } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

async function ensurePublicUser(admin: AdminClient, userId: string) {
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existing) return;

  const username = `runner-${userId.slice(0, 6)}`;
  const { error } = await admin.from("users").insert({
    id: userId,
    username,
  });
  if (error) throw new Error(error.message);
}

async function requireCandidate(accessToken?: string | null) {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to manage coalitions.");
  const admin = createAdminClient();
  await ensurePublicUser(admin, userId);
  return { admin, userId };
}

function revalidateCoalitionPaths(candidateIds: string[]) {
  revalidatePath("/my-campaign/coalitions");
  revalidatePath("/my-campaign");
  for (const id of [...new Set(candidateIds)]) {
    revalidatePath(`/profile/${id}`);
  }
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function createCoalition(
  name: string,
  charterStatement: string,
  accessToken?: string | null,
) {
  const trimmedName = normalizeName(name);
  const charter = charterStatement.trim();

  if (trimmedName.length < 2 || trimmedName.length > COALITION_NAME_MAX) {
    throw new Error(`Name must be between 2 and ${COALITION_NAME_MAX} characters.`);
  }
  if (charter.length < COALITION_CHARTER_MIN || charter.length > COALITION_CHARTER_MAX) {
    throw new Error(
      `Charter must be between ${COALITION_CHARTER_MIN} and ${COALITION_CHARTER_MAX} characters.`,
    );
  }

  const { admin, userId } = await requireCandidate(accessToken);

  const { data: coalition, error: coalitionError } = await admin
    .from("coalitions")
    .insert({
      name: trimmedName,
      charter_statement: charter,
      founder_id: userId,
    })
    .select("*")
    .maybeSingle();

  if (coalitionError) throw new Error(coalitionError.message);
  if (!coalition) throw new Error("Could not charter the coalition.");

  const { error: memberError } = await admin.from("coalition_members").insert({
    coalition_id: coalition.id,
    candidate_id: userId,
    status: "active",
  });

  if (memberError) {
    await admin.from("coalitions").delete().eq("id", coalition.id);
    throw new Error(memberError.message);
  }

  revalidateCoalitionPaths([userId]);
  return { ok: true as const, coalitionId: coalition.id };
}

export async function inviteToCoalition(
  coalitionId: string,
  candidateId: string,
  accessToken?: string | null,
) {
  const trimmedCoalitionId = coalitionId.trim();
  const trimmedCandidateId = candidateId.trim();

  if (!isUuid(trimmedCoalitionId) || !isUuid(trimmedCandidateId)) {
    throw new Error("A valid coalition and candidate are required.");
  }

  const { admin, userId } = await requireCandidate(accessToken);
  if (trimmedCandidateId === userId) {
    throw new Error("You are already seated in your own coalition.");
  }

  const { data: coalition, error: coalitionError } = await admin
    .from("coalitions")
    .select("*")
    .eq("id", trimmedCoalitionId)
    .maybeSingle();

  if (coalitionError) throw new Error(coalitionError.message);
  if (!coalition) throw new Error("Coalition not found.");

  const { data: inviterSeat, error: inviterError } = await admin
    .from("coalition_members")
    .select("id, status")
    .eq("coalition_id", trimmedCoalitionId)
    .eq("candidate_id", userId)
    .maybeSingle();

  if (inviterError) throw new Error(inviterError.message);
  if (!inviterSeat || inviterSeat.status !== "active") {
    throw new Error("Only seated members can issue endorsements.");
  }

  const { data: invitee, error: inviteeError } = await admin
    .from("users")
    .select("id")
    .eq("id", trimmedCandidateId)
    .maybeSingle();

  if (inviteeError) throw new Error(inviteeError.message);
  if (!invitee) throw new Error("That candidate is not on a ticket yet.");

  const { data: existing, error: existingError } = await admin
    .from("coalition_members")
    .select("id, status")
    .eq("coalition_id", trimmedCoalitionId)
    .eq("candidate_id", trimmedCandidateId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.status === "active") {
    throw new Error("That campaign is already seated in this coalition.");
  }
  if (existing?.status === "pending") {
    throw new Error("An endorsement invite is already outstanding.");
  }

  const { error: insertError } = await admin.from("coalition_members").insert({
    coalition_id: trimmedCoalitionId,
    candidate_id: trimmedCandidateId,
    status: "pending",
  });

  if (insertError) throw new Error(insertError.message);

  revalidateCoalitionPaths([userId, trimmedCandidateId]);
  return { ok: true as const };
}

export async function acceptCoalitionInvite(
  coalitionId: string,
  accessToken?: string | null,
) {
  const trimmedCoalitionId = coalitionId.trim();
  if (!isUuid(trimmedCoalitionId)) {
    throw new Error("A valid coalition is required.");
  }

  const { admin, userId } = await requireCandidate(accessToken);

  const { data: seat, error: seatError } = await admin
    .from("coalition_members")
    .select("*")
    .eq("coalition_id", trimmedCoalitionId)
    .eq("candidate_id", userId)
    .maybeSingle();

  if (seatError) throw new Error(seatError.message);
  if (!seat) throw new Error("No pending invite for this coalition.");
  if (seat.status === "active") {
    throw new Error("You are already seated in this coalition.");
  }

  const { error: updateError } = await admin
    .from("coalition_members")
    .update({ status: "active" })
    .eq("id", seat.id)
    .eq("candidate_id", userId)
    .eq("status", "pending");

  if (updateError) throw new Error(updateError.message);

  revalidateCoalitionPaths([userId, (seat as CoalitionMember).candidate_id]);
  return { ok: true as const };
}

export async function loadMyCoalitionInbox(accessToken?: string | null) {
  const { admin, userId } = await requireCandidate(accessToken);

  const { data: seats, error } = await admin
    .from("coalition_members")
    .select("*")
    .eq("candidate_id", userId);

  if (error) {
    if (isMissingRelation(error)) {
      const { data: profile } = await admin
        .from("users")
        .select("id, username, ideology_vector, target_district_id")
        .eq("id", userId)
        .maybeSingle();
      return {
        ok: true as const,
        userId,
        memberships: [] as CoalitionMember[],
        outstanding: [] as CoalitionMember[],
        ideologyVector: profile?.ideology_vector ?? null,
        targetDistrictId: profile?.target_district_id ?? null,
      };
    }
    throw new Error(error.message);
  }

  const memberships = (seats ?? []) as CoalitionMember[];
  const managedIds = memberships
    .filter((seat) => seat.status === "active")
    .map((seat) => seat.coalition_id);

  let outstanding: CoalitionMember[] = [];
  if (managedIds.length > 0) {
    const { data: pendingRows, error: pendingError } = await admin
      .from("coalition_members")
      .select("*")
      .in("coalition_id", managedIds)
      .eq("status", "pending");

    if (pendingError) throw new Error(pendingError.message);
    outstanding = (pendingRows ?? []) as CoalitionMember[];
  }

  const { data: profile } = await admin
    .from("users")
    .select("id, username, ideology_vector, target_district_id")
    .eq("id", userId)
    .maybeSingle();

  return {
    ok: true as const,
    userId,
    memberships,
    outstanding,
    ideologyVector: profile?.ideology_vector ?? null,
    targetDistrictId: profile?.target_district_id ?? null,
  };
}
