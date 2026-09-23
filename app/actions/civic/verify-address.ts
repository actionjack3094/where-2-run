"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import {
  extractOcdIdentifiers,
  isMissingCivicColumn,
} from "@/lib/civic-fencing";
import { createAdminClient } from "@/lib/db/supabase-admin";
import type { UserProfile } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

type CivicApiError = {
  code?: number;
  message?: string;
};

type CivicDivisionsByAddressResponse = {
  divisions?: Record<string, unknown>;
  error?: CivicApiError;
};

export type CivicVerificationState = {
  ok: true;
  userId: string;
  tier2Verified: boolean;
  ocdIdentifiers: string[];
};

const CIVIC_ENDPOINT = "https://www.googleapis.com/civicinfo/v2/divisionsByAddress";
const ADDRESS_MIN = 5;
const ADDRESS_MAX = 200;

function civicColumnMessage() {
  return "ocd_identifiers is not on profiles yet. Apply the civic fencing migration.";
}

function civicApiKey() {
  return process.env.GOOGLE_CIVIC_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function asOcdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

async function ensurePublicUser(admin: AdminClient, userId: string) {
  const { data: existing, error } = await admin
    .from("users")
    .select("id, ocd_identifiers, tier_2_verified")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingCivicColumn(error)) throw new Error(civicColumnMessage());
    throw new Error(error.message);
  }

  if (existing) {
    return existing as Pick<UserProfile, "id" | "ocd_identifiers" | "tier_2_verified">;
  }

  const username = `runner-${userId.slice(0, 6)}`;
  const { data: created, error: insertError } = await admin
    .from("users")
    .insert({
      id: userId,
      username,
    })
    .select("id, ocd_identifiers, tier_2_verified")
    .maybeSingle();

  if (insertError) {
    if (isMissingCivicColumn(insertError)) throw new Error(civicColumnMessage());
    throw new Error(insertError.message);
  }
  if (!created) throw new Error("Could not open a campaign profile.");
  return created as Pick<UserProfile, "id" | "ocd_identifiers" | "tier_2_verified">;
}

async function requireProfile(accessToken?: string | null) {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to verify a local address.");
  const admin = createAdminClient();
  const profile = await ensurePublicUser(admin, userId);
  return { admin, userId, profile };
}

function revalidateCivicPaths() {
  revalidatePath("/my-campaign");
  revalidatePath("/my-campaign/verify");
  revalidatePath("/dashboard");
  revalidatePath("/feed");
}

function toState(profile: Pick<UserProfile, "id" | "ocd_identifiers" | "tier_2_verified">): CivicVerificationState {
  return {
    ok: true,
    userId: profile.id,
    tier2Verified: Boolean(profile.tier_2_verified),
    ocdIdentifiers: asOcdArray(profile.ocd_identifiers),
  };
}

export async function loadCivicVerification(
  accessToken?: string | null,
): Promise<CivicVerificationState> {
  const { profile } = await requireProfile(accessToken);
  return toState(profile);
}

export async function verifyAddress(
  address: string,
  accessToken?: string | null,
): Promise<CivicVerificationState> {
  const trimmed = address.trim().replace(/\s+/g, " ");
  if (trimmed.length < ADDRESS_MIN) {
    throw new Error("Enter a street address with city and state.");
  }
  if (trimmed.length > ADDRESS_MAX) {
    throw new Error(`Address must be ${ADDRESS_MAX} characters or fewer.`);
  }

  const apiKey = civicApiKey();
  if (!apiKey) {
    throw new Error("Google Civic API key is not configured.");
  }

  const { admin, userId } = await requireProfile(accessToken);

  const url = new URL(CIVIC_ENDPOINT);
  url.searchParams.set("address", trimmed);
  url.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Could not reach the Google Civic Information API.");
  }

  const payload = (await response.json().catch(() => null)) as CivicDivisionsByAddressResponse | null;
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? "Could not map that address to a civic division.",
    );
  }

  const ocdIdentifiers = extractOcdIdentifiers(payload?.divisions);
  if (ocdIdentifiers.length === 0) {
    throw new Error("No civic divisions were returned for that address.");
  }

  const { data: updated, error } = await admin
    .from("users")
    .update({
      ocd_identifiers: ocdIdentifiers,
      tier_2_verified: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, ocd_identifiers, tier_2_verified")
    .maybeSingle();

  if (error) {
    if (isMissingCivicColumn(error)) throw new Error(civicColumnMessage());
    throw new Error(error.message);
  }
  if (!updated) throw new Error("Could not save civic identifiers.");

  revalidateCivicPaths();
  return toState(updated as Pick<UserProfile, "id" | "ocd_identifiers" | "tier_2_verified">);
}
