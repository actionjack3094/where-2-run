"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  CANDIDACY_PDF_MAX_BYTES,
  CANDIDACY_PROOF_BUCKET,
  candidacyDocumentPath,
  committeeNameError,
  donationUrlError,
  normalizeCommitteeName,
  normalizeOfficialCandidateId,
  officialCandidateIdError,
  officialDonationHref,
  pdfHeaderError,
} from "@/lib/escrow/candidacy";

type CandidacyFiling = {
  committeeName: string;
  donationUrl: string;
};

/**
 * File a Statement of Candidacy against a locked campaign target.
 * Moves escrow from accumulating to verification_pending.
 */
export async function submitCandidacyProof(
  targetId: string,
  candidateId: string,
  documentUrl: string,
  filing: CandidacyFiling,
) {
  const userId = await requireActionUserId();
  if (!userId) throw new Error("Sign in to claim escrow.");

  const id = targetId.trim();
  if (!isUuid(id)) throw new Error("A locked campaign target is required.");

  const candidateIdError = officialCandidateIdError(candidateId);
  if (candidateIdError) throw new Error(candidateIdError);
  const officialCandidateId = normalizeOfficialCandidateId(candidateId);

  const committeeError = committeeNameError(filing?.committeeName ?? "");
  if (committeeError) throw new Error(committeeError);
  const committeeName = normalizeCommitteeName(filing.committeeName);

  const donateError = donationUrlError(filing?.donationUrl ?? "");
  if (donateError) throw new Error(donateError);
  const donationUrl = officialDonationHref(filing.donationUrl);
  if (!donationUrl) throw new Error("Enter the campaign's https ActBlue or WinRed page.");

  const documentPath = candidacyDocumentPath(documentUrl, userId, id);
  if (!documentPath) {
    throw new Error("Upload the Statement of Candidacy PDF before submitting.");
  }

  const admin = createAdminClient();
  const { data: proof, error: proofError } = await admin.storage
    .from(CANDIDACY_PROOF_BUCKET)
    .download(documentPath);

  if (proofError || !proof) {
    throw new Error("That Statement of Candidacy PDF is not on file.");
  }
  if (proof.size <= 0 || proof.size > CANDIDACY_PDF_MAX_BYTES) {
    throw new Error("Attach a PDF smaller than 10 MB.");
  }

  const header = new Uint8Array(await proof.slice(0, 5).arrayBuffer());
  const headerError = pdfHeaderError(header);
  if (headerError) throw new Error(headerError);

  const { data, error } = await admin
    .from("campaign_targets")
    .select("id, user_id, is_locked, escrow_status")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const target = data as {
    id: string;
    user_id: string;
    is_locked: boolean | null;
    escrow_status: string | null;
  } | null;

  if (!target || target.user_id !== userId) {
    throw new Error("That locked campaign is not on your ledger.");
  }
  if (!target.is_locked) throw new Error("Lock this campaign before claiming escrow.");
  if (target.escrow_status === "verification_pending") {
    throw new Error("This campaign is already waiting on FEC or state verification.");
  }
  if (target.escrow_status === "released") {
    throw new Error("This escrow has already been released.");
  }
  if (target.escrow_status !== "accumulating") {
    throw new Error("This campaign is not open for a candidacy filing.");
  }

  const { data: updated, error: updateError } = await admin
    .from("campaign_targets")
    .update({
      official_candidate_id: officialCandidateId,
      escrow_status: "verification_pending",
      committee_name: committeeName,
      candidacy_document_url: documentPath,
      donation_url: donationUrl,
    })
    .eq("id", target.id)
    .eq("user_id", userId)
    .eq("is_locked", true)
    .eq("escrow_status", "accumulating")
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error("This campaign is not open for a candidacy filing.");

  revalidatePath(`/candidate/${userId}`);
  revalidatePath("/claim");
  return { escrowStatus: "verification_pending" as const };
}
