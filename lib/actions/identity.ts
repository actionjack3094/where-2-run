"use server";

import { requireActionUserId } from "@/lib/arena/auth";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";

export { createIdentityVerificationSession } from "@/lib/actions/stripe";

type Tier2Status = "unverified" | "pending" | "verified";

export type IdentityStatusResult =
  | { ok: true; userId: string; tier2Status: Tier2Status }
  | { ok: false; error: string };

function parseTier2Status(value: unknown): Tier2Status {
  if (value === "pending" || value === "verified") return value;
  return "unverified";
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
