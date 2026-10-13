import { SoapboxFeed } from "@/app/soapbox/soapbox-feed";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import { normalizeZip } from "@/lib/electability";
import { hasStanceVector } from "@/lib/ideology/stance";
import { getOnboardingProgress } from "@/lib/onboarding/gate";

/** Local opens for a signed-in member who filed the Townhall baseline and a ZIP. */
async function localFeedUnlocked() {
  const progress = await getOnboardingProgress();
  if (!progress.signedIn || !progress.hasStance) return false;

  const user = await getServerUser();
  if (!user) return false;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("residency_zip, stance_vector")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return progress.hasHome;
  const zipOnFile = normalizeZip(data.residency_zip).length === 5 || progress.hasHome;
  return zipOnFile && hasStanceVector(data.stance_vector);
}

export async function SoapboxPage() {
  const localEnabled = await localFeedUnlocked().catch(() => false);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <SoapboxFeed localEnabled={localEnabled} />
    </main>
  );
}
