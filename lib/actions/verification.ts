"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { jurisdictionLabels, normalizeOcdId } from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isTier2DocumentType } from "@/lib/verification-documents";

export type SubmitTier2VerificationResult =
  | { ok: true; requestId: string; alreadyPending: boolean }
  | { ok: false; error: string };

export type VerificationPanelState =
  | { ok: false; error: string }
  | {
      ok: true;
      /** The user's primary district: the first entry of home_ocd_ids. */
      ocdId: string | null;
      districtName: string | null;
      /** True when tier2_verifications (address lookup or approval) already covers it. */
      verified: boolean;
      /** The user's latest claim for this district, if any. */
      request: { status: string; documentType: string; createdAt: string } | null;
    };

const GENERIC_ERROR = "We couldn't submit that verification. Please try again.";

/**
 * File a manual Tier 2 residency claim for one of the user's home districts.
 * Writes a `pending` row to `tier2_verification_requests` for review.
 *
 * It deliberately does NOT write `tier2_verifications`: that table is the
 * verified record (one row per user, presence of `ocd_ids` grants access), so
 * a pending claim there would unlock civic features before anyone reviewed it.
 * Approval is what writes that table.
 *
 * MOCK: no document is uploaded or checked yet; `documentType` records which
 * proof the user says they will provide.
 */
export async function submitTier2Verification(
  ocdId: string,
  documentType: string,
  accessToken?: string | null,
): Promise<SubmitTier2VerificationResult> {
  try {
    const wanted = normalizeOcdId(ocdId);
    if (!wanted) return { ok: false, error: "Choose a district to verify." };
    if (!isTier2DocumentType(documentType)) {
      return { ok: false, error: "Choose which document you will provide." };
    }

    const userId = await requireActionUserId(accessToken);
    if (!userId) return { ok: false, error: "Sign in to verify your residency." };

    const admin = createAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("home_ocd_ids")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;

    // Only a district on the user's own ballot can be claimed.
    const home = ((profile?.home_ocd_ids ?? []) as string[]).map(normalizeOcdId);
    if (!home.includes(wanted)) {
      return { ok: false, error: "That district isn't one of your home districts." };
    }

    const { data: verified, error: verifiedError } = await admin
      .from("tier2_verifications")
      .select("ocd_ids")
      .eq("user_id", userId)
      .maybeSingle();
    if (verifiedError && !isMissingRelation(verifiedError)) throw verifiedError;
    const alreadyVerified = ((verified?.ocd_ids ?? []) as string[])
      .map(normalizeOcdId)
      .includes(wanted);
    if (alreadyVerified) {
      return { ok: false, error: "You're already verified for that district." };
    }

    const findPending = () =>
      admin
        .from("tier2_verification_requests")
        .select("id")
        .eq("user_id", userId)
        .eq("ocd_id", wanted)
        .eq("status", "pending")
        .maybeSingle();

    const existing = await findPending();
    if (existing.error) throw existing.error;
    if (existing.data) {
      return { ok: true, requestId: existing.data.id, alreadyPending: true };
    }

    const { data: created, error: insertError } = await admin
      .from("tier2_verification_requests")
      .insert({ user_id: userId, ocd_id: wanted, document_type: documentType, status: "pending" })
      .select("id")
      .single();

    if (insertError || !created) {
      // 23505: a parallel click filed the same claim first.
      if (insertError?.code === "23505") {
        const raced = await findPending();
        if (raced.data) return { ok: true, requestId: raced.data.id, alreadyPending: true };
      }
      throw insertError ?? new Error("Verification insert returned no row.");
    }

    revalidatePath("/profile");
    return { ok: true, requestId: created.id, alreadyPending: false };
  } catch (caught) {
    console.error("submitTier2Verification failed.", caught);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Everything the profile's verification panel needs, for the signed-in user only. */
export async function loadVerificationPanel(
  accessToken?: string | null,
): Promise<VerificationPanelState> {
  try {
    const userId = await requireActionUserId(accessToken);
    if (!userId) return { ok: false, error: "Sign in to see verification." };

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("home_ocd_ids")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;

    const ocdId = ((profile?.home_ocd_ids ?? []) as string[]).find((id) => id?.trim()) ?? null;
    if (!ocdId) {
      return { ok: true, ocdId: null, districtName: null, verified: false, request: null };
    }
    const wanted = normalizeOcdId(ocdId);

    const [district, verified, requests] = await Promise.all([
      admin.from("districts").select("name, ocd_id").eq("ocd_id", ocdId).limit(1).maybeSingle(),
      admin.from("tier2_verifications").select("ocd_ids").eq("user_id", userId).maybeSingle(),
      admin
        .from("tier2_verification_requests")
        .select("status, document_type, created_at")
        .eq("user_id", userId)
        .eq("ocd_id", wanted)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (district.error && !isMissingRelation(district.error)) throw district.error;
    if (verified.error && !isMissingRelation(verified.error)) throw verified.error;
    if (requests.error && !isMissingRelation(requests.error)) throw requests.error;

    const latest = requests.data?.[0] ?? null;
    return {
      ok: true,
      ocdId,
      districtName: district.data?.name?.trim() || jurisdictionLabels([ocdId], 1)[0] || ocdId,
      verified: ((verified.data?.ocd_ids ?? []) as string[]).map(normalizeOcdId).includes(wanted),
      request: latest
        ? {
            status: latest.status,
            documentType: latest.document_type,
            createdAt: latest.created_at,
          }
        : null,
    };
  } catch (caught) {
    console.error("loadVerificationPanel failed.", caught);
    return { ok: false, error: "We couldn't load your verification status." };
  }
}
