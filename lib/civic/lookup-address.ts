import { encryptResidentialAddress } from "@/lib/civic/address-cipher";
import { assignConstituentDistrict } from "@/lib/civic/district-routing";
import { extractOcdIdentifiers, isMissingCivicColumn } from "@/lib/civic-fencing";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";

const CIVIC_ENDPOINT = "https://www.googleapis.com/civicinfo/v2/divisionsByAddress";
const ADDRESS_MIN = 5;
const ADDRESS_MAX = 200;

type AdminClient = ReturnType<typeof createAdminClient>;

function civicApiKey() {
  return process.env.GOOGLE_CIVIC_API_KEY || process.env.GOOGLE_API_KEY || "";
}

export async function divisionsForAddress(address: string) {
  const trimmed = address.trim().replace(/\s+/g, " ");
  if (trimmed.length < ADDRESS_MIN) {
    throw new Error("Enter a street address with city and state.");
  }
  if (trimmed.length > ADDRESS_MAX) {
    throw new Error(`Address must be ${ADDRESS_MAX} characters or fewer.`);
  }

  const apiKey = civicApiKey();
  if (!apiKey) throw new Error("Google Civic API key is not configured.");

  const url = new URL(CIVIC_ENDPOINT);
  url.searchParams.set("address", trimmed);
  url.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Could not reach the Google Civic Information API.");
  }

  const payload = (await response.json().catch(() => null)) as {
    divisions?: Record<string, unknown>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Could not map that address to a civic division.");
  }

  const ocdIdentifiers = extractOcdIdentifiers(payload?.divisions);
  if (ocdIdentifiers.length === 0) {
    throw new Error("No civic divisions were returned for that address.");
  }

  return { address: trimmed, ocdIdentifiers };
}

async function loadRoutingRows(admin: AdminClient) {
  const [districts, elections] = await Promise.all([
    admin.from("districts").select("id, ocd_id"),
    admin.from("elections").select("ocd_id, district_id"),
  ]);

  if (districts.error && !isMissingSchema(districts.error)) {
    throw new Error(districts.error.message);
  }
  if (elections.error && !isMissingSchema(elections.error)) {
    throw new Error(elections.error.message);
  }

  return {
    districts: (districts.data ?? []).map((row) => ({
      id: row.id,
      ocdId: row.ocd_id ?? null,
    })),
    elections: (elections.data ?? []).map((row) => ({
      ocdId: row.ocd_id ?? null,
      districtId: row.district_id,
    })),
  };
}

export async function routeVoterAddress(userId: string, address: string) {
  const admin = createAdminClient();
  const located = await divisionsForAddress(address);
  const rows = await loadRoutingRows(admin);
  const assignment = assignConstituentDistrict({
    ocdIds: located.ocdIdentifiers,
    districts: rows.districts,
    elections: rows.elections,
  });

  const { error: userError } = await admin
    .from("users")
    .update({
      ocd_identifiers: located.ocdIdentifiers,
      tier_2_verified: true,
      ...(assignment.districtId ? { target_district_id: assignment.districtId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (userError) {
    if (isMissingCivicColumn(userError)) {
      throw new Error("ocd_identifiers is not on profiles yet. Apply the civic fencing migration.");
    }
    throw new Error(userError.message);
  }

  const { error: tierError } = await admin.from("tier2_verifications").upsert({
    user_id: userId,
    verified_address: encryptResidentialAddress(located.address),
    ocd_ids: located.ocdIdentifiers,
    verified_at: new Date().toISOString(),
  });

  if (tierError && !isMissingSchema(tierError)) {
    throw new Error(tierError.message);
  }

  return {
    ocdIdentifiers: located.ocdIdentifiers,
    ...assignment,
  };
}
