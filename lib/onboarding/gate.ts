import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import { hasStanceVector } from "@/lib/ideology/stance";

function asOcdIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

export type OnboardingProgress = {
  signedIn: boolean;
  hasHome: boolean;
  hasStance: boolean;
  complete: boolean;
};

export const getOnboardingProgress = cache(async function getOnboardingProgress(): Promise<OnboardingProgress> {
  const user = await getServerUser();
  if (!user) {
    return { signedIn: false, hasHome: false, hasStance: false, complete: false };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("home_ocd_ids, stance_vector")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getOnboardingProgress failed.", error);
    return { signedIn: true, hasHome: false, hasStance: false, complete: false };
  }

  const hasHome = asOcdIds(data?.home_ocd_ids).length > 0;
  const hasStance = hasStanceVector(data?.stance_vector);
  return { signedIn: true, hasHome, hasStance, complete: hasHome && hasStance };
});

const EXEMPT_PREFIXES = ["/onboarding", "/auth", "/about", "/api"];

function isOnboardingExempt(pathname: string) {
  if (!pathname || pathname === "/") return true;
  return EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Send signed-in users without a district or stance vector to `/onboarding`. */
export async function redirectIfOnboardingIncomplete() {
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (isOnboardingExempt(pathname)) return;

  const progress = await getOnboardingProgress();
  if (progress.signedIn && !progress.complete) {
    redirect("/onboarding");
  }
}
