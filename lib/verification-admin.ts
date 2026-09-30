import { normalizeOcdId } from "@/lib/civic-fencing";
import { createAdminClient } from "@/lib/db/supabase-admin";

/**
 * Reviewer-only actions for Tier 2 residency claims.
 *
 * Deliberately NOT a "use server" module and not exported from
 * lib/actions/verification.ts: every export of a "use server" file is a public
 * endpoint, and anyone could call approveTier2Verification on their own
 * request. Import this from trusted code only (scripts, a future admin route
 * that checks the reviewer's role first).
 */

/** Stored where a document review has no street address to encrypt. */
const MANUAL_REVIEW_MARKER = "manual-document-review";

export type ApproveTier2Result = {
  requestId: string;
  userId: string;
  ocdId: string;
  /** False when the request was already approved and nothing changed. */
  changed: boolean;
  ocdIds: string[];
};

/**
 * Approve a pending claim: mark it approved and add its district to the user's
 * tier2_verifications.ocd_ids (creating the row if they have none), which is
 * what makes their ballots count as verified-constituent votes.
 */
export async function approveTier2Verification(requestId: string): Promise<ApproveTier2Result> {
  const admin = createAdminClient();

  const { data: request, error: requestError } = await admin
    .from("tier2_verification_requests")
    .select("id, user_id, ocd_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error(`No verification request with id ${requestId}.`);

  const ocdId = normalizeOcdId(request.ocd_id);
  const existing = await admin
    .from("tier2_verifications")
    .select("ocd_ids")
    .eq("user_id", request.user_id)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const held = ((existing.data?.ocd_ids ?? []) as string[]).map(normalizeOcdId);

  if (request.status === "approved") {
    return {
      requestId: request.id,
      userId: request.user_id,
      ocdId,
      changed: false,
      ocdIds: held,
    };
  }
  if (request.status !== "pending") {
    throw new Error(`Request ${requestId} is ${request.status}, not pending.`);
  }

  const ocdIds = held.includes(ocdId) ? held : [...held, ocdId];

  // Verification first: if the status flip fails afterwards the request stays
  // pending and approving again is a safe retry.
  if (existing.data) {
    const { error } = await admin
      .from("tier2_verifications")
      .update({ ocd_ids: ocdIds })
      .eq("user_id", request.user_id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("tier2_verifications").insert({
      user_id: request.user_id,
      verified_address: MANUAL_REVIEW_MARKER,
      ocd_ids: ocdIds,
    });
    if (error) throw new Error(error.message);
  }

  // Same flag the address lookup sets (syncProfileDivisions).
  const { error: profileError } = await admin
    .from("users")
    .update({ tier_2_verified: true, updated_at: new Date().toISOString() })
    .eq("id", request.user_id);
  if (profileError) throw new Error(profileError.message);

  const { error: statusError } = await admin
    .from("tier2_verification_requests")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", request.id)
    .eq("status", "pending");
  if (statusError) throw new Error(statusError.message);

  return { requestId: request.id, userId: request.user_id, ocdId, changed: true, ocdIds };
}
