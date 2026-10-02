"use server";

import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import { sendEscrowClaimReviewEmail } from "@/lib/actions/email";
import {
  normalizeOfficialCandidateId,
  officialCandidateIdError,
  officialDonationHref,
} from "@/lib/escrow/candidacy";
import { getStripe } from "@/lib/stripe";

type AdminClient = ReturnType<typeof createAdminClient>;

function filingReference(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter an FEC ID or a state registration link.");
  }

  if (/^https:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Enter an https state registration link.");
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error("Enter an https state registration link.");
    }
    if (url.toString().length > 500) {
      throw new Error("That registration link is too long.");
    }
    return url.toString();
  }

  const idError = officialCandidateIdError(trimmed);
  if (idError) throw new Error(idError);
  return normalizeOfficialCandidateId(trimmed);
}

function adminEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? process.env.PLATFORM_ADMIN_EMAIL ?? "")
    .split(/[,;\s]+/)
    .map((email) => email.trim())
    .filter((email) => email.includes("@"));
}

async function notifyAdmins(input: {
  candidateName: string;
  targetId: string;
  filing: string;
  amount: number;
}) {
  const recipients = adminEmails();
  if (recipients.length === 0) {
    console.error(
      `Escrow claim ${input.targetId} for ${input.candidateName} is waiting on review. Set PLATFORM_ADMIN_EMAIL to notify an admin.`,
    );
    return;
  }

  await Promise.all(
    recipients.map((to) =>
      sendEscrowClaimReviewEmail(to, {
        candidateName: input.candidateName,
        targetId: input.targetId,
        filing: input.filing,
        amount: input.amount,
      }),
    ),
  );
}

/**
 * Candidate files an FEC ID or state registration link. Escrow moves from
 * accumulating to verification_pending and platform admins are asked to review.
 */
export async function initiateEscrowClaim(targetId: string, filing: string) {
  const userId = await requireActionUserId();
  if (!userId) throw new Error("Sign in to claim escrow.");

  const id = targetId.trim();
  if (!isUuid(id)) throw new Error("A locked campaign target is required.");
  const filingRecord = filingReference(filing);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaign_targets")
    .select("id, user_id, is_locked, escrow_status, pledged_escrow")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const target = data as {
    id: string;
    user_id: string;
    is_locked: boolean | null;
    escrow_status: string | null;
    pledged_escrow: number | string | null;
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
    throw new Error("This campaign is not open for a claim.");
  }

  const { data: updated, error: updateError } = await admin
    .from("campaign_targets")
    .update({
      official_candidate_id: filingRecord,
      escrow_status: "verification_pending",
    })
    .eq("id", target.id)
    .eq("user_id", userId)
    .eq("is_locked", true)
    .eq("escrow_status", "accumulating")
    .select("id")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error("This campaign is not open for a claim.");

  const { data: profile } = await admin.from("users").select("username").eq("id", userId).maybeSingle();
  await notifyAdmins({
    candidateName: profile?.username?.trim() || "A candidate",
    targetId: target.id,
    filing: filingRecord,
    amount: Number(target.pledged_escrow ?? 0) || 0,
  });

  revalidatePath("/claim");
  revalidatePath(`/candidate/${userId}`);
  return { escrowStatus: "verification_pending" as const };
}

async function requirePlatformAdmin() {
  const user = await getServerUser();
  if (!user?.email) throw new Error("Sign in to review escrow claims.");
  const email = user.email.trim().toLowerCase();
  const allowed = adminEmails().map((entry) => entry.toLowerCase());
  if (!allowed.includes(email)) {
    throw new Error("Only a platform admin can release escrow.");
  }
  return user;
}

async function captureHeldSession(stripe: Stripe, sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) {
    throw new Error(`Checkout session ${sessionId} has no payment to capture.`);
  }

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status === "succeeded") return;
  if (intent.status !== "requires_capture") {
    throw new Error(`Payment ${paymentIntentId} is ${intent.status} and cannot be captured.`);
  }
  await stripe.paymentIntents.capture(paymentIntentId);
}

async function captureHeldPledges(admin: AdminClient, targetId: string) {
  const { data, error } = await admin
    .from("campaign_pledges")
    .select("id, stripe_session_id, status")
    .eq("target_id", targetId)
    .eq("status", "held");
  if (error) throw new Error(error.message);

  const pledges = (data ?? []) as { id: string; stripe_session_id: string | null; status: string }[];
  const stripe = getStripe();

  for (const pledge of pledges) {
    const sessionId = pledge.stripe_session_id?.trim() ?? "";
    if (!sessionId) {
      throw new Error("A held pledge is missing its Stripe Checkout session.");
    }
    await captureHeldSession(stripe, sessionId);
    const { error: updateError } = await admin
      .from("campaign_pledges")
      .update({ status: "captured" })
      .eq("id", pledge.id)
      .eq("status", "held");
    if (updateError) throw new Error(updateError.message);
  }

  return pledges.length;
}

/**
 * Admin release. Saves the ActBlue or WinRed page, captures every held
 * authorization on the target, then marks those pledges captured.
 */
export async function approveEscrowClaim(targetId: string, actblueUrl: string) {
  await requirePlatformAdmin();

  const id = targetId.trim();
  if (!isUuid(id)) throw new Error("A campaign target is required.");
  const donationUrl = officialDonationHref(actblueUrl);
  if (!donationUrl) throw new Error("Enter the campaign's https ActBlue or WinRed page.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaign_targets")
    .select("id, user_id, escrow_status, is_locked")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const target = data as {
    id: string;
    user_id: string;
    escrow_status: string | null;
    is_locked: boolean | null;
  } | null;
  if (!target) throw new Error("That campaign target is not on the ledger.");
  if (target.escrow_status === "released") {
    return { escrowStatus: "released" as const, captured: 0 };
  }
  if (target.escrow_status !== "verification_pending") {
    throw new Error("This claim is not waiting on verification.");
  }

  const captured = await captureHeldPledges(admin, target.id);

  const { data: updated, error: updateError } = await admin
    .from("campaign_targets")
    .update({
      escrow_status: "released",
      donation_url: donationUrl,
    })
    .eq("id", target.id)
    .eq("escrow_status", "verification_pending")
    .select("id")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error("This claim is not waiting on verification.");

  revalidatePath("/claim");
  revalidatePath(`/candidate/${target.user_id}`);
  revalidatePath("/leaderboards");
  return { escrowStatus: "released" as const, captured };
}
