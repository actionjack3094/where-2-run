import Stripe from "stripe";
import { encryptResidentialAddress } from "@/lib/civic/address-cipher";
import { isMissingSchema } from "@/lib/db/schema-errors";
import type { createAdminClient } from "@/lib/db/supabase-admin";

export const TIER2_STATUSES = ["unverified", "pending", "verified"] as const;
export type Tier2Status = (typeof TIER2_STATUSES)[number];

type AdminClient = ReturnType<typeof createAdminClient>;

export function parseTier2Status(value: unknown): Tier2Status {
  if (value === "pending" || value === "verified") return value;
  return "unverified";
}

function asOcdIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== ""),
    ),
  ];
}

function stripeAddressLine(address: Stripe.Address | null | undefined) {
  if (!address) return "";
  return [address.line1, address.line2, address.city, address.state, address.postal_code, address.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

function encryptedIdentityMarker(sessionId: string, address: string) {
  try {
    return encryptResidentialAddress(address || `stripe-identity:${sessionId}`);
  } catch {
    return `identity:${sessionId}`;
  }
}

export async function loadTier2Status(admin: AdminClient, userId: string): Promise<Tier2Status> {
  const { data, error } = await admin
    .from("profiles")
    .select("tier2_status")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return "unverified";
    throw new Error(error.message);
  }
  return parseTier2Status(data?.tier2_status);
}

/**
 * True when Stripe Identity has verified this user.
 * If the column is not migrated yet, skip the identity gate so older databases
 * keep using address-only jury eligibility.
 */
export async function isStripeIdentityVerified(
  admin: AdminClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("profiles")
    .select("tier2_status")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return true;
    throw new Error(error.message);
  }
  return parseTier2Status(data?.tier2_status) === "verified";
}

export async function markIdentitySessionPending(
  admin: AdminClient,
  userId: string,
  sessionId: string,
) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("profiles")
    .update({
      stripe_identity_session_id: sessionId,
      tier2_status: "pending",
      updated_at: now,
    })
    .eq("id", userId)
    .neq("tier2_status", "verified")
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return;
    throw new Error(error.message);
  }
  if (data) return;

  const existing = await admin.from("profiles").select("id, tier2_status").eq("id", userId).maybeSingle();
  if (existing.error) {
    if (isMissingSchema(existing.error)) return;
    throw new Error(existing.error.message);
  }
  if (existing.data) return;

  const { error: insertError } = await admin.from("profiles").insert({
    id: userId,
    stripe_identity_session_id: sessionId,
    tier2_status: "pending",
    updated_at: now,
  });
  if (insertError && insertError.code !== "23505" && !isMissingSchema(insertError)) {
    throw new Error(insertError.message);
  }
}

export type ApplyIdentityResult = {
  userId: string;
  alreadyVerified: boolean;
};

/**
 * Upgrade a constituent to Tier 2 after Stripe Identity reports verified.
 * Idempotent: a retried webhook does not re-alert.
 */
export async function applyVerifiedIdentitySession(
  admin: AdminClient,
  session: Stripe.Identity.VerificationSession,
): Promise<ApplyIdentityResult | null> {
  const userId = session.metadata?.userId?.trim() || session.client_reference_id?.trim() || "";
  if (!userId) {
    console.error("identity.verification_session.verified is missing userId metadata.", session.id);
    return null;
  }
  if (session.status !== "verified") return null;

  const now = new Date().toISOString();
  const current = await admin
    .from("profiles")
    .select("id, tier2_status")
    .eq("id", userId)
    .maybeSingle();
  if (current.error && !isMissingSchema(current.error)) {
    throw new Error(current.error.message);
  }

  const alreadyVerified = parseTier2Status(current.data?.tier2_status) === "verified";
  const profilePatch = {
    tier2_status: "verified" as const,
    stripe_identity_session_id: session.id,
    identity_verified_at: now,
    updated_at: now,
  };

  if (current.data) {
    const { error } = await admin.from("profiles").update(profilePatch).eq("id", userId);
    if (error && !isMissingSchema(error)) throw new Error(error.message);
  } else {
    const { error } = await admin.from("profiles").insert({
      id: userId,
      ...profilePatch,
    });
    if (error && error.code !== "23505" && !isMissingSchema(error)) {
      throw new Error(error.message);
    }
  }

  const { data: userRow, error: userError } = await admin
    .from("users")
    .select("home_ocd_ids, matched_ocd_ids, ocd_identifiers")
    .eq("id", userId)
    .maybeSingle();
  if (userError && !isMissingSchema(userError)) throw new Error(userError.message);

  const { error: flagError } = await admin
    .from("users")
    .update({
      tier_2_verified: true,
      is_verified: true,
      updated_at: now,
    })
    .eq("id", userId);
  if (flagError && !isMissingSchema(flagError) && !/tier_2_verified|is_verified/i.test(flagError.message)) {
    throw new Error(flagError.message);
  }

  const { data: existingTier, error: tierReadError } = await admin
    .from("tier2_verifications")
    .select("ocd_ids, verified_address")
    .eq("user_id", userId)
    .maybeSingle();
  if (tierReadError && !isMissingSchema(tierReadError)) throw new Error(tierReadError.message);

  const ocdIds = [
    ...new Set([
      ...asOcdIds(existingTier?.ocd_ids),
      ...asOcdIds(userRow?.home_ocd_ids),
      ...asOcdIds(userRow?.matched_ocd_ids),
      ...asOcdIds(userRow?.ocd_identifiers),
    ]),
  ];
  const stripeAddress = stripeAddressLine(session.verified_outputs?.address);
  const verifiedAddress =
    existingTier?.verified_address?.trim() || encryptedIdentityMarker(session.id, stripeAddress);

  const { error: upsertError } = await admin.from("tier2_verifications").upsert({
    user_id: userId,
    verified_address: verifiedAddress,
    ocd_ids: ocdIds,
    verified_at: now,
  });
  if (upsertError && !isMissingSchema(upsertError)) throw new Error(upsertError.message);

  return { userId, alreadyVerified };
}
