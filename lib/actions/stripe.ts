"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { requireActionUserId } from "@/lib/arena/auth";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getStripe } from "@/lib/stripe";

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
