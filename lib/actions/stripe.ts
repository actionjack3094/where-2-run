"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getStripe, getStripePublishableKey, getStripeWebhookSecret } from "@/lib/stripe";

type AdminClient = ReturnType<typeof createAdminClient>;

export type StripeConnectResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const CONNECT_ERROR = "We couldn't start Stripe onboarding. Please try again.";
const MISSING_KEY = "Stripe is not configured. Add STRIPE_SECRET_KEY to start payouts.";
const DECLARE_FIRST = "Declare a race before connecting a payout account.";

async function requestOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (!host) return "http://localhost:3000";
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

function stripeMessage(error: unknown, fallback: string) {
  if (error instanceof Stripe.errors.StripeError) {
    const message = error.message ?? "";
    if (/signed up for Connect|enable Connect/i.test(message)) {
      return "Stripe Connect isn't enabled on this platform yet. Turn it on in the Stripe Dashboard, then try again.";
    }
    return message;
  }
  if (error instanceof Error && /STRIPE_SECRET_KEY/i.test(error.message)) return MISSING_KEY;
  return fallback;
}

async function loadConnectProfile(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, stripe_account_id, stripe_onboarding_complete")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) {
      throw new Error(
        "profiles is missing Stripe Connect columns. Apply the stripe connect accounts migration.",
      );
    }
    throw error;
  }
  return data as {
    id: string;
    email: string | null;
    stripe_account_id: string | null;
    stripe_onboarding_complete: boolean | null;
  } | null;
}

async function saveConnectAccount(
  admin: AdminClient,
  userId: string,
  accountId: string,
  email: string | null,
) {
  const now = new Date().toISOString();
  const existing = await loadConnectProfile(admin, userId);
  if (!existing) {
    const { error } = await admin.from("profiles").insert({
      id: userId,
      email,
      stripe_account_id: accountId,
      stripe_onboarding_complete: false,
      updated_at: now,
    });
    if (error) throw error;
    return;
  }

  if (existing.stripe_account_id === accountId) return;

  const { error } = await admin
    .from("profiles")
    .update({ stripe_account_id: accountId, updated_at: now })
    .eq("id", userId);
  if (error) throw error;
}

async function hasDeclaredRace(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("campaign_targets")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return false;
    throw error;
  }
  return Boolean(data);
}

async function createAccountLink(accountId: string, origin: string) {
  const stripe = getStripe();
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/profile/stripe/refresh`,
    return_url: `${origin}/profile/stripe/return`,
    type: "account_onboarding",
  });
}

function revalidateConnect() {
  revalidatePath("/profile");
  revalidatePath("/profile/stripe/return");
  revalidatePath("/profile/stripe/refresh");
}

/**
 * Create (or reuse) a Stripe Express account for the signed-in candidate and
 * return a hosted onboarding URL. The Express account id is saved first so
 * `/profile/stripe/return` can finish linkage after Stripe redirects back.
 */
export async function createStripeConnectAccount(): Promise<StripeConnectResult> {
  try {
    const userId = await requireActionUserId();
    if (!userId) return { ok: false, error: "Sign in to connect a payout account." };

    const admin = createAdminClient();
    if (!(await hasDeclaredRace(admin, userId))) {
      return { ok: false, error: DECLARE_FIRST };
    }

    const profile = await loadConnectProfile(admin, userId);
    if (profile?.stripe_onboarding_complete && profile.stripe_account_id) {
      return { ok: true, url: "/profile" };
    }

    const stripe = getStripe();
    let accountId = profile?.stripe_account_id?.trim() || "";

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: profile?.email?.trim() || undefined,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: { user_id: userId },
      });
      accountId = account.id;
      await saveConnectAccount(admin, userId, accountId, profile?.email ?? null);
    }

    const origin = await requestOrigin();
    const link = await createAccountLink(accountId, origin);
    revalidateConnect();
    return { ok: true, url: link.url };
  } catch (caught) {
    console.error("createStripeConnectAccount failed.", caught);
    return { ok: false, error: stripeMessage(caught, CONNECT_ERROR) };
  }
}

/**
 * After Stripe redirects back, mark the Express account complete when
 * hosted onboarding reported `details_submitted`.
 */
export async function finalizeStripeConnectAccount(): Promise<
  | { ok: true; complete: boolean }
  | { ok: false; error: string }
> {
  try {
    const userId = await requireActionUserId();
    if (!userId) return { ok: false, error: "Sign in to finish Stripe onboarding." };

    const admin = createAdminClient();
    const profile = await loadConnectProfile(admin, userId);
    const accountId = profile?.stripe_account_id?.trim();
    if (!accountId) {
      return { ok: false, error: "No Stripe account is linked yet. Start Connect from the vault." };
    }

    const account = await getStripe().accounts.retrieve(accountId);
    const complete = Boolean(account.details_submitted);
    const { error } = await admin
      .from("profiles")
      .update({
        stripe_onboarding_complete: complete,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) throw error;

    revalidateConnect();
    return { ok: true, complete };
  } catch (caught) {
    console.error("finalizeStripeConnectAccount failed.", caught);
    return { ok: false, error: stripeMessage(caught, CONNECT_ERROR) };
  }
}

export async function loadStripeConnectStatus(userId: string) {
  try {
    const admin = createAdminClient();
    const profile = await loadConnectProfile(admin, userId);
    return {
      accountId: profile?.stripe_account_id ?? null,
      complete: Boolean(profile?.stripe_onboarding_complete),
    };
  } catch (caught) {
    console.error("loadStripeConnectStatus failed.", caught);
    return { accountId: null, complete: false };
  }
}

export type IdentityVerificationResult =
  | { ok: true; url: string; clientSecret: string | null }
  | { ok: true; url: null; clientSecret: null; status: "verified" }
  | { ok: false; error: string };

const IDENTITY_ERROR = "We couldn't start identity verification. Please try again.";

function identityMessage(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) return error.message;
  if (error instanceof Error && /STRIPE_SECRET_KEY/i.test(error.message)) {
    return "Stripe is not configured. Add STRIPE_SECRET_KEY to verify identity.";
  }
  if (error instanceof Error && /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/i.test(error.message)) {
    return "Stripe is not configured. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.";
  }
  if (error instanceof Error && /STRIPE_WEBHOOK_SECRET/i.test(error.message)) {
    return "Stripe webhooks are not configured. Add STRIPE_WEBHOOK_SECRET.";
  }
  return IDENTITY_ERROR;
}

/**
 * Open a Stripe Identity document check for the signed-in user.
 * `metadata.user_id` is the profile the verified webhook updates.
 * The browser redirects to `url`. `client_secret` is included for the modal fallback.
 */
export async function createIdentityVerificationSession(): Promise<IdentityVerificationResult> {
  try {
    const userId = await requireActionUserId();
    if (!userId || !isUuid(userId)) {
      return { ok: false, error: "Sign in to verify your identity." };
    }

    getStripePublishableKey();
    getStripeWebhookSecret();
    const stripe = getStripe();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("is_verified, tier2_status, stripe_identity_session_id")
      .eq("id", userId)
      .maybeSingle();
    if (error && !isMissingSchema(error)) throw error;

    const profile = data as {
      is_verified: boolean | null;
      tier2_status: string | null;
      stripe_identity_session_id: string | null;
    } | null;
    if (profile?.is_verified || profile?.tier2_status === "verified") {
      return { ok: true, url: null, clientSecret: null, status: "verified" };
    }

    const origin = await requestOrigin();
    const existingSessionId = profile?.stripe_identity_session_id?.trim();
    if (existingSessionId) {
      const existing = await stripe.identity.verificationSessions.retrieve(existingSessionId);
      if (existing.status === "verified") {
        return { ok: true, url: null, clientSecret: null, status: "verified" };
      }
      if (existing.status === "processing") {
        return { ok: false, error: "Stripe is still reviewing your documents." };
      }
      if (existing.status === "requires_input" && existing.url) {
        return { ok: true, url: existing.url, clientSecret: existing.client_secret };
      }
    }

    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      client_reference_id: userId,
      return_url: `${origin}/verify`,
      metadata: { user_id: userId },
      options: {
        document: {
          allowed_types: ["driving_license", "id_card", "passport"],
        },
      },
    });

    if (!session.url && !session.client_secret) {
      return { ok: false, error: "Stripe did not return a verification link." };
    }

    const { error: pendingError } = await admin
      .from("profiles")
      .update({
        tier2_status: "pending",
        stripe_identity_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (pendingError && !isMissingSchema(pendingError)) throw pendingError;

    revalidatePath("/verify");
    revalidatePath("/profile");
    return {
      ok: true,
      url: session.url ?? "",
      clientSecret: session.client_secret,
    };
  } catch (caught) {
    console.error("createIdentityVerificationSession failed.", caught);
    return { ok: false, error: identityMessage(caught) };
  }
}
