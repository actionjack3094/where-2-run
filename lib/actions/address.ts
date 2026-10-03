"use server";

import { revalidatePath } from "next/cache";
import { encryptResidentialAddress } from "@/lib/civic/address-cipher";
import { divisionsForAddress } from "@/lib/civic/lookup-address";
import {
  districtsFromCensusGeographies,
  districtsFromOcdIds,
  type CensusGeoRow,
  type VoterDistrictFields,
} from "@/lib/civic/voter-districts";
import { requireActionUserId } from "@/lib/arena/auth";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";

const ADDRESS_MIN = 8;
const ADDRESS_MAX = 200;

export type VoterAddressResult =
  | { ok: true; districts: VoterDistrictFields }
  | { ok: false; error: string };

function civicKey() {
  return process.env.GOOGLE_CIVIC_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || "";
}

function cleanAddress(address: string) {
  const trimmed = address.trim().replace(/\s+/g, " ");
  if (trimmed.length < ADDRESS_MIN) {
    throw new Error("Enter a street address with city and state.");
  }
  if (trimmed.length > ADDRESS_MAX) {
    throw new Error(`Address must be ${ADDRESS_MAX} characters or fewer.`);
  }
  return trimmed;
}

async function districtsFromCensus(address: string) {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Could not reach the Census geocoder.");
  }
  if (!response.ok) {
    throw new Error("The Census geocoder could not match that address.");
  }

  const payload = (await response.json().catch(() => null)) as {
    result?: { addressMatches?: Array<{ geographies?: Record<string, CensusGeoRow[] | undefined> }> };
  } | null;
  const geographies = payload?.result?.addressMatches?.[0]?.geographies;
  const districts = districtsFromCensusGeographies(geographies);
  if (districts.ocdIds.length === 0) {
    throw new Error("No voting districts were returned for that address.");
  }
  return districts;
}

async function locateAddress(address: string) {
  if (civicKey()) {
    try {
      const located = await divisionsForAddress(address);
      const districts = districtsFromOcdIds(located.ocdIdentifiers);
      if (districts.ocdIds.length > 0) return { address: located.address, districts };
    } catch (caught) {
      if (!/not configured/i.test(caught instanceof Error ? caught.message : "")) {
        const census = await districtsFromCensus(address).catch(() => null);
        if (census) return { address, districts: census };
        throw caught;
      }
    }
  }
  return { address, districts: await districtsFromCensus(address) };
}

/**
 * Resolve a residential address to Open Civic Data divisions and save them
 * on the signed-in profile. The street address is stored as ciphertext.
 */
export async function resolveVoterAddress(addressString: string): Promise<VoterAddressResult> {
  try {
    const userId = await requireActionUserId();
    if (!userId) return { ok: false, error: "Sign in to confirm your address." };

    const located = await locateAddress(cleanAddress(addressString));
    const districts = located.districts;
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const patch = {
      residential_address: encryptResidentialAddress(located.address),
      state_code: districts.stateCode,
      congressional_district: districts.congressionalDistrict,
      state_leg_district_upper: districts.stateLegDistrictUpper,
      state_leg_district_lower: districts.stateLegDistrictLower,
      county: districts.county,
      municipality: districts.municipality,
      ocd_ids: districts.ocdIds,
      updated_at: now,
    };

    const existing = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (existing.error && !isMissingSchema(existing.error)) throw new Error(existing.error.message);

    const write = existing.data
      ? admin.from("profiles").update(patch).eq("id", userId)
      : admin.from("profiles").insert({
          id: userId,
          candidate_tier: "pundit",
          ...patch,
        });
    const { error } = await write;
    if (error) {
      if (isMissingSchema(error)) {
        return {
          ok: false,
          error: "Apply the voter address migration, then confirm the address again.",
        };
      }
      throw new Error(error.message);
    }

    const legacy = await admin
      .from("users")
      .update({
        home_ocd_ids: districts.ocdIds,
        ocd_identifiers: districts.ocdIds,
        updated_at: now,
      })
      .eq("id", userId);
    if (legacy.error && !isMissingSchema(legacy.error)) {
      console.error("resolveVoterAddress legacy ballot sync failed.", legacy.error.message);
    }

    revalidatePath("/ballot");
    revalidatePath("/onboarding/address");
    return { ok: true, districts };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not resolve that address.";
    return { ok: false, error: message };
  }
}
