"use server";

import { Resend } from "resend";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";

const DEBATE_ORIGIN = "https://where-2-run.vercel.app";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function challengeMessage(challengerName: string) {
  const name = challengerName.trim() || "A candidate";
  return `You have been challenged to a debate by ${name}. You have 24 hours to take the floor before forfeiting.`;
}

async function recipientEmail(
  admin: ReturnType<typeof createAdminClient>,
  targetUserId: string,
) {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email")
    .eq("id", targetUserId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);

  const profileEmail = profile?.email?.trim();
  if (profileEmail) return profileEmail;

  const { data, error } = await admin.auth.admin.getUserById(targetUserId);
  if (error) throw new Error(error.message);

  const authEmail = data.user?.email?.trim();
  if (!authEmail) {
    throw new Error("No email address on file for this candidate.");
  }
  return authEmail;
}

export async function sendChallengeEmail(
  targetUserId: string,
  challengerName: string,
  debateId: string,
  accessToken?: string | null,
) {
  if (!isUuid(targetUserId) || !isUuid(debateId)) {
    throw new Error("A valid opponent and debate are required.");
  }

  const callerId = await requireActionUserId(accessToken);
  if (!callerId) throw new Error("Sign in to challenge.");

  const admin = createAdminClient();
  const { data: debate, error: debateError } = await admin
    .from("debates")
    .select("candidate_a_id, candidate_b_id")
    .eq("id", debateId)
    .maybeSingle();

  if (debateError) throw new Error(debateError.message);
  if (!debate) throw new Error("Debate not found.");

  const targetIsOpponent =
    (debate.candidate_a_id === callerId && debate.candidate_b_id === targetUserId) ||
    (debate.candidate_b_id === callerId && debate.candidate_a_id === targetUserId);

  if (!targetIsOpponent) {
    throw new Error("You can only notify the opponent on your debate.");
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  if (!from) throw new Error("Missing RESEND_FROM_EMAIL");

  const email = await recipientEmail(admin, targetUserId);
  const debateUrl = `${DEBATE_ORIGIN}/debates/${debateId}`;
  const message = challengeMessage(challengerName);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: "You have been challenged to a debate",
    text: `${message}\n\n${debateUrl}`,
    html: `<p>${escapeHtml(message)}</p><p><a href="${debateUrl}">${debateUrl}</a></p>`,
  });

  if (error) throw new Error(error.message);
}
