"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  ballotNameError,
  ballotOcdError,
  governmentIdReferenceError,
} from "@/lib/verification/tier3";

export async function submitTier3Claim(
  input: {
    candidateId: string;
    governmentIdReference: string;
    ballotName: string;
    ballotOcdId: string;
  },
  accessToken?: string | null,
) {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to claim a seeded profile.");
  if (!isUuid(input.candidateId)) throw new Error("Choose a seeded profile.");

  const referenceError = governmentIdReferenceError(input.governmentIdReference);
  if (referenceError) throw new Error(referenceError);
  const nameError = ballotNameError(input.ballotName);
  if (nameError) throw new Error(nameError);
  const ocdError = ballotOcdError(input.ballotOcdId);
  if (ocdError) throw new Error(ocdError);

  const admin = createAdminClient();
  const { data: candidate, error: candidateError } = await admin
    .from("candidates")
    .select("id, claimed_by")
    .eq("id", input.candidateId)
    .maybeSingle();

  if (candidateError) throw new Error(candidateError.message);
  if (!candidate) throw new Error("That seeded profile is not on the ledger.");
  if (candidate.claimed_by && candidate.claimed_by !== userId) {
    throw new Error("Another campaign already claimed that profile.");
  }

  const now = new Date().toISOString();
  const ballotOcdId = input.ballotOcdId.trim().toLowerCase();
  const ballotName = input.ballotName.trim();
  const reference = input.governmentIdReference.trim();

  const { data: previous } = await admin
    .from("tier3_verifications")
    .select("claimed_candidate_id, claim_status")
    .eq("user_id", userId)
    .maybeSingle();

  if (previous?.claim_status === "matched") {
    throw new Error("This campaign is already matched to a ballot.");
  }

  const { error } = await admin.from("tier3_verifications").upsert({
    user_id: userId,
    claimed_candidate_id: input.candidateId,
    claim_status: "submitted",
    government_id_reference: reference,
    government_id_status: "submitted",
    ballot_name: ballotName,
    ballot_ocd_id: ballotOcdId,
    ballot_source: "local_ballot",
    ballot_cross_reference: {
      ballot_name: ballotName,
      ocd_id: ballotOcdId,
      source: "local_ballot",
      submitted_at: now,
    },
    submitted_at: now,
    updated_at: now,
  });

  if (error) throw new Error(error.message);

  if (
    previous?.claimed_candidate_id &&
    previous.claimed_candidate_id !== input.candidateId
  ) {
    await admin
      .from("candidates")
      .update({ claimed_by: null })
      .eq("id", previous.claimed_candidate_id)
      .eq("claimed_by", userId);
  }

  const { error: claimError } = await admin
    .from("candidates")
    .update({ claimed_by: userId })
    .eq("id", input.candidateId);

  if (claimError) throw new Error(claimError.message);

  revalidatePath("/verify");
  revalidatePath("/my-campaign/verify");
}
