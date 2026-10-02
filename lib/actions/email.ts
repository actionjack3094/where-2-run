import { createElement, type ReactElement } from "react";
import { Resend } from "resend";
import {
  PledgeFundedEmail,
  type PledgeFundedEmailProps,
} from "@/emails/PledgeFundedEmail";
import { createAdminClient } from "@/lib/db/supabase-admin";

const resend = new Resend(process.env.RESEND_API_KEY);

export type PledgeFundedEmailData = PledgeFundedEmailProps;

function isSimBotEmail(email: string) {
  return email.trim().toLowerCase().startsWith("arena-sim+");
}

/**
 * Resend's sandbox only delivers to the account owner. Skip sim bots and
 * non-production sends unless RESEND_SEND_IN_DEV=true.
 */
function bypassResend(email: string, label: string) {
  const simBot = isSimBotEmail(email);
  const devBypass =
    process.env.NODE_ENV !== "production" && process.env.RESEND_SEND_IN_DEV !== "true";
  if (!simBot && !devBypass) return false;

  console.log(
    `[LOCAL DEV] Bypassed Resend ${label} to: ${email}${simBot ? " (sim bot)" : ""}`,
  );
  return true;
}

async function dispatch(input: {
  label: string;
  to: string;
  subject: string;
  react: ReactElement;
}) {
  const to = input.to.trim();
  if (!to) {
    console.error(`[resend] ${input.label} skipped: missing recipient`);
    return;
  }
  if (bypassResend(to, input.label)) return;

  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.error(`[resend] ${input.label} skipped: missing RESEND_API_KEY`);
    return;
  }
  if (!from) {
    console.error(`[resend] ${input.label} skipped: missing RESEND_FROM_EMAIL`);
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: input.subject,
      react: input.react,
    });
    if (error) {
      console.error(`[resend] ${input.label} failed: ${error.message}`);
      return;
    }
    console.log(`[resend] ${input.label} accepted id=${data?.id ?? "unknown"}`);
  } catch (caught) {
    console.error(`[resend] ${input.label} threw.`, caught);
  }
}

export async function lookupUserEmail(userId: string): Promise<string | null> {
  const id = userId.trim();
  if (!id) return null;

  try {
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("email")
      .eq("id", id)
      .maybeSingle();
    if (profileError) {
      console.error(`[resend] profile email lookup failed: ${profileError.message}`);
    } else {
      const profileEmail = profile?.email?.trim();
      if (profileEmail) return profileEmail;
    }

    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error) {
      console.error(`[resend] auth email lookup failed: ${error.message}`);
      return null;
    }
    return data.user?.email?.trim() || null;
  } catch (caught) {
    console.error("[resend] email lookup threw.", caught);
    return null;
  }
}

export async function sendEscrowClaimReviewEmail(
  to: string,
  data: { candidateName: string; targetId: string; filing: string; amount: number },
) {
  const amount = Number.isFinite(data.amount) ? data.amount : 0;
  const candidateName = data.candidateName.trim() || "A candidate";
  await dispatch({
    label: "escrow claim review",
    to,
    subject: `Review escrow claim for ${candidateName}`,
    react: createElement(
      "div",
      null,
      createElement("p", null, `${candidateName} filed an escrow claim for review.`),
      createElement("p", null, `Target ${data.targetId}`),
      createElement("p", null, `Filing: ${data.filing}`),
      createElement("p", null, `Held escrow: $${amount.toFixed(2)}`),
    ),
  });
}

export async function sendPledgeFundedEmail(to: string, data: PledgeFundedEmailData) {
  const amount = Number.isFinite(data.amount) ? data.amount : 0;
  const candidateName = data.candidateName.trim() || "this campaign";
  await dispatch({
    label: "pledge funded email",
    to,
    subject: `Receipt: your pledge to ${candidateName} is funded`,
    react: createElement(PledgeFundedEmail, {
      candidateName,
      amount,
      electionId: data.electionId,
    }),
  });
}
