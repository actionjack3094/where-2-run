"use server";

import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getStripe } from "@/lib/stripe";

type Tier2Status = "unverified" | "pending" | "verified";

export type IdentitySessionResult =
  | { ok: true; clientSecret: string }
  | { ok: true; clientSecret: null; status: "verified" }
  | { ok: false; error: string };

export type IdentityStatusResult =
  | { ok: true; userId: string; tier2Status: Tier2Status }
  | { ok: false; error: string };

function parseTier2Status(value: unknown): Tier2Status {
  if (value === "pending" || value === "verified") return value;
  return "unverified";
}

async function markIdentitySessionPending(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  sessionId: string,
) {
  const { error } = await admin
    .from("profiles")
    .update({
      tier2_status: "pending",
      stripe_identity_session_id: sessionId,
    })
    .eq("id", userId);
  if (error && !isMissingSchema(error)) throw new Error(error.message);
}

const GENERIC_ERROR = "We couldn't start identity verification. Please try again.";
const MISSING_KEY = "Stripe is not configured. Add STRIPE_SECRET_KEY to verify identity.";

function stripeMessage(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) return error.message;
  if (error instanceof Error && /STRIPE_SECRET_KEY/i.test(error.message)) return MISSING_KEY;
  return GENERIC_ERROR;
}

/**
 * Open a Stripe Identity document session for the signed-in user.
 * The browser modal consumes `client_secret`. The webhook sets `users.tier`
 * to `verified` after Stripe confirms the session.
 */
export async function createIdentityVerificationSession(): Promise<IdentitySessionResult> {
  try {
    const callerId = await requireActionUserId();
    if (!callerId || !isUuid(callerId)) {
      return { ok: false, error: "Sign in to verify your identity." };
    }

    const admin = createAdminClient();
    const [profileResult, userResult] = await Promise.all([
      admin
        .from("profiles")
        .select("tier2_status, stripe_identity_session_id")
        .eq("id", callerId)
        .maybeSingle(),
      admin.from("users").select("tier").eq("id", callerId).maybeSingle(),
    ]);
    if (profileResult.error && !isMissingSchema(profileResult.error)) {
      throw profileResult.error;
    }
    if (userResult.error) throw userResult.error;

    const profile = profileResult.data;
    const alreadyVerified =
      parseTier2Status(profile?.tier2_status) === "verified" ||
      userResult.data?.tier === "verified";
    if (alreadyVerified) {
      return { ok: true, clientSecret: null, status: "verified" };
    }

    const stripe = getStripe();
    const existingSessionId = profile?.stripe_identity_session_id?.trim();
    if (existingSessionId) {
      const existing = await stripe.identity.verificationSessions.retrieve(existingSessionId);
      if (existing.status === "verified") {
        return { ok: true, clientSecret: null, status: "verified" };
      }
      if (existing.status === "requires_input" && existing.client_secret) {
        return { ok: true, clientSecret: existing.client_secret };
      }
    }

    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      client_reference_id: callerId,
      metadata: { user_id: callerId, userId: callerId },
      options: {
        document: {
          allowed_types: ["driving_license", "id_card", "passport"],
        },
      },
    });

    if (!session.client_secret) {
      return { ok: false, error: "Stripe did not return a verification client secret." };
    }

    await markIdentitySessionPending(admin, callerId, session.id);
    revalidatePath("/profile");
    revalidatePath("/verify");
    return { ok: true, clientSecret: session.client_secret };
  } catch (caught) {
    console.error("createIdentityVerificationSession failed.", caught);
    return { ok: false, error: stripeMessage(caught) };
  }
}

export async function loadIdentityVerificationStatus(): Promise<IdentityStatusResult> {
  try {
    const userId = await requireActionUserId();
    if (!userId) return { ok: false, error: "Sign in to see verification." };

    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("tier2_status")
      .eq("id", userId)
      .maybeSingle();
    if (error && !isMissingSchema(error)) throw error;

    return {
      ok: true,
      userId,
      tier2Status: parseTier2Status(data?.tier2_status),
    };
  } catch (caught) {
    console.error("loadIdentityVerificationStatus failed.", caught);
    return { ok: false, error: "We couldn't load your identity verification status." };
  }
}
