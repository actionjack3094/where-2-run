import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import { normalizeZip } from "@/lib/electability";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { hasStanceVector } from "@/lib/ideology/stance";

function asOcdIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

export type OnboardingProgress = {
  signedIn: boolean;
  hasHome: boolean;
  hasStance: boolean;
  hasVector: boolean;
  hasZip: boolean;
  complete: boolean;
};

export const getOnboardingProgress = cache(async function getOnboardingProgress(): Promise<OnboardingProgress> {
  const user = await getServerUser();
  if (!user) {
    return { signedIn: false, hasHome: false, hasStance: false, hasVector: false, hasZip: false, complete: false };
  }

  const admin = createAdminClient();
  const [{ data, error }, profile] = await Promise.all([
    admin.from("users").select("home_ocd_ids, stance_vector, residency_zip").eq("id", user.id).maybeSingle(),
    loadProfileCoordinate(admin, user.id),
  ]);

  if (error) {
    console.error("getOnboardingProgress failed.", error);
    return { signedIn: true, hasHome: false, hasStance: false, hasVector: false, hasZip: false, complete: false };
  }

  const hasHome = asOcdIds(data?.home_ocd_ids).length > 0;
  const hasStance = hasStanceVector(data?.stance_vector);
  const hasVector = hasStance || (profile.x != null && profile.y != null);
  const hasZip =
    normalizeZip(profile.votingZip).length === 5 ||
    normalizeZip(data?.residency_zip).length === 5 ||
    hasHome;
  return { signedIn: true, hasHome, hasStance, hasVector, hasZip, complete: hasVector && hasZip };
});

async function loadProfileCoordinate(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  let result = await admin
    .from("profiles")
    .select("ideology_x, ideology_y, voting_zip_code")
    .eq("id", userId)
    .maybeSingle();
  if (result.error && isMissingSchema(result.error)) {
    result = await admin.from("profiles").select("ideology_x, ideology_y").eq("id", userId).maybeSingle();
  }
  const row = (result.data ?? null) as {
    ideology_x?: number | null;
    ideology_y?: number | null;
    voting_zip_code?: string | null;
  } | null;
  return {
    x: row?.ideology_x ?? null,
    y: row?.ideology_y ?? null,
    votingZip: row?.voting_zip_code ?? null,
  };
}

const EXEMPT_PREFIXES = [
  "/onboarding",
  "/auth",
  "/about",
  "/api",
  "/soapbox",
  "/ballot",
  "/my-ballot",
  "/elections",
  "/campaign",
  "/campaign-hub",
];

function isOnboardingExempt(pathname: string) {
  if (!pathname) return true;
  return EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Send a signed-in member through the diagnostic, then the voting ZIP, before matched primaries. */
export async function redirectIfOnboardingIncomplete() {
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (isOnboardingExempt(pathname)) return;

  const progress = await getOnboardingProgress();
  if (!progress.signedIn || progress.complete) return;
  if (!progress.hasVector) redirect("/onboarding");
  redirect("/onboarding/location");
}
