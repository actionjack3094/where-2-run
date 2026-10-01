import { redirect } from "next/navigation";
import { OnboardingFunnel } from "@/app/onboarding/components/OnboardingFunnel";
import { getServerUser } from "@/lib/db/supabase-server";
import { getOnboardingProgress } from "@/lib/onboarding/gate";

export default async function OnboardingPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/login?mode=create");

  const progress = await getOnboardingProgress();
  if (progress.complete) redirect("/matchmaker");

  return <OnboardingFunnel startAt={progress.hasHome ? "calibration" : "address"} />;
}
