"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { encryptResidentialAddress } from "@/lib/civic/address-cipher";
import {
  extractOcdIdentifiers,
  isMissingCivicColumn,
  jurisdictionLabels,
} from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type CivicApiError = {
  code?: number;
  message?: string;
};

type NormalizedInput = {
  line1?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type CivicDivisionsByAddressResponse = {
  divisions?: Record<string, unknown>;
  normalizedInput?: NormalizedInput;
  error?: CivicApiError;
};

export type Tier2VerificationState = {
  ok: true;
  verified: boolean;
  ocdIds: string[];
  jurisdictions: string[];
  verifiedAt: string | null;
};

const CIVIC_ENDPOINT = "https://www.googleapis.com/civicinfo/v2/divisionsByAddress";
const ADDRESS_MIN = 5;
const ADDRESS_MAX = 200;

function missingTableMessage() {
  return "tier2_verifications is not in the database yet. Apply the Tier 2 verification migration.";
}

function asOcdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function civicApiKey() {
  return process.env.GOOGLE_CIVIC_API_KEY?.trim() ?? "";
}

function verifiedAddressFrom(payload: CivicDivisionsByAddressResponse | null, submitted: string) {
  const input = payload?.normalizedInput;
  if (!input) return submitted;
  const line1 = input.line1?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const zip = input.zip?.trim() ?? "";
  const region = [state, zip].filter(Boolean).join(" ");
  const composed = [line1, city, region].filter(Boolean).join(", ");
  return composed || submitted;
}

function toState(row: {
  ocd_ids: unknown;
  verified_at: string | null;
} | null): Tier2VerificationState {
  const ocdIds = asOcdArray(row?.ocd_ids);
  return {
    ok: true,
    verified: ocdIds.length > 0,
    ocdIds,
    jurisdictions: jurisdictionLabels(ocdIds),
    verifiedAt: row?.verified_at ?? null,
  };
}

async function ensurePublicUser(admin: AdminClient, userId: string) {
  const { data: existing, error } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (existing) return;

  const { error: insertError } = await admin.from("users").insert({
    id: userId,
    username: `runner-${userId.slice(0, 6)}`,
  });
  if (insertError) throw new Error(insertError.message);
}

async function syncProfileDivisions(admin: AdminClient, userId: string, ocdIds: string[]) {
  const { error } = await admin
    .from("users")
    .update({
      ocd_identifiers: ocdIds,
      tier_2_verified: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error && !isMissingCivicColumn(error)) {
    throw new Error(error.message);
  }
}

function revalidateVerificationPaths() {
  revalidatePath("/profile");
  revalidatePath("/my-campaign");
  revalidatePath("/my-campaign/verify");
  revalidatePath("/feed");
}

export async function loadTier2Verification(
  accessToken?: string | null,
): Promise<Tier2VerificationState> {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to check civic verification.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tier2_verifications")
    .select("ocd_ids, verified_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) throw new Error(missingTableMessage());
    throw new Error(error.message);
  }

  return toState(data);
}

export async function verifyAddress(
  address: string,
  accessToken?: string | null,
): Promise<Tier2VerificationState> {
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

  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to verify a residential address.");

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

  const ocdIds = extractOcdIdentifiers(payload?.divisions);
  if (ocdIds.length === 0) {
    throw new Error("No civic divisions were returned for that address.");
  }

  const admin = createAdminClient();
  await ensurePublicUser(admin, userId);

  const verifiedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("tier2_verifications")
    .upsert(
      {
        user_id: userId,
        verified_address: encryptResidentialAddress(verifiedAddressFrom(payload, trimmed)),
        ocd_ids: ocdIds,
        verified_at: verifiedAt,
      },
      { onConflict: "user_id" },
    )
    .select("ocd_ids, verified_at")
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) throw new Error(missingTableMessage());
    throw new Error(error.message);
  }
  if (!data) throw new Error("Could not save civic verification.");

  await syncProfileDivisions(admin, userId, ocdIds);
  revalidateVerificationPaths();
  return toState(data);
}
