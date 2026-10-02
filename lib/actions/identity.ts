"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getStripe } from "@/lib/stripe";

type Tier2Status = "unverified" | "pending" | "verified";

export type IdentitySessionResult =
  | { ok: true; url: string }
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

async function requestOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (!host) return "http://localhost:3000";
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

function stripeMessage(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) return error.message;
  if (error instanceof Error && /STRIPE_SECRET_KEY/i.test(error.message)) return MISSING_KEY;
  return GENERIC_ERROR;
}

/**
 * Open Stripe Identity's hosted document capture for this constituent.
 * The webhook upgrades `profiles.tier2_status` after verification succeeds.
 */
export async function createIdentityVerificationSession(
  userId: string,
): Promise<IdentitySessionResult> {
  try {
    const wanted = userId.trim();
    if (!isUuid(wanted)) return { ok: false, error: "Sign in to verify your identity." };

    const callerId = await requireActionUserId();
    if (!callerId) return { ok: false, error: "Sign in to verify your identity." };
    if (callerId !== wanted) {
      return { ok: false, error: "You can only verify your own identity." };
    }

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("tier2_status, stripe_identity_session_id")
      .eq("id", callerId)
      .maybeSingle();
    if (profileError && !isMissingSchema(profileError)) throw profileError;

    if (parseTier2Status(profile?.tier2_status) === "verified") {
      return { ok: true, url: "/profile" };
    }

    const stripe = getStripe();
    const existingSessionId = profile?.stripe_identity_session_id?.trim();
    if (existingSessionId) {
      const existing = await stripe.identity.verificationSessions.retrieve(existingSessionId);
      if (existing.status === "requires_input" && existing.url) {
        return { ok: true, url: existing.url };
      }
      if (existing.status === "verified") {
        return { ok: true, url: "/profile?identity=complete" };
      }
    }

    const origin = await requestOrigin();
    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      client_reference_id: callerId,
      metadata: { userId: callerId },
      return_url: `${origin}/profile?identity=complete`,
      options: {
        document: {
          allowed_types: ["driving_license", "id_card", "passport"],
        },
      },
    });

    if (!session.url) {
      return { ok: false, error: "Stripe did not return a verification URL." };
    }

    await markIdentitySessionPending(admin, callerId, session.id);
    revalidatePath("/profile");
    return { ok: true, url: session.url };
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
