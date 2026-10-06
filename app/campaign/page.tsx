import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CampaignRoadmap } from "@/components/campaign/CampaignRoadmap";
import { DropoutButton } from "@/components/pledges/DropoutButton";
import { loadRoadmapInputs } from "@/lib/campaign/hq";
import { campaignMilestones } from "@/lib/campaign/milestones";
import { getServerUser } from "@/lib/db/supabase-server";
import { platformAdmin } from "@/lib/platform/records";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaign Hub · WHERE 2 RUN",
  description: "Milestone roadmap from the first debate to an official ballot filing.",
};

export default async function CampaignHubPage() {
  const user = await getServerUser().catch(() => null);
  if (!user) redirect("/auth/login?next=%2Fcampaign");

  let milestones = campaignMilestones({
    concludedDebates: 0,
    civicStanding: 0,
    pledged: 0,
    filed: false,
  });
  let setup: string | null = null;
  let primaryId: string | null = null;
  try {
    const inputs = await loadRoadmapInputs(platformAdmin(), user.id);
    milestones = campaignMilestones(inputs);
    const standing = await platformAdmin()
      .from("primary_standings")
      .select("primary_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    primaryId = standing.error ? null : ((standing.data as { primary_id: string } | null)?.primary_id ?? null);
  } catch (caught) {
    setup = caught instanceof Error ? caught.message : "Could not load the roadmap.";
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">Candidate</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
            Campaign Hub
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Four milestones between a first stance and a line on the official ballot. Day-to-day work stays in{" "}
            <Link href="/dashboard" className="text-amber-800">
              Candidate HQ
            </Link>
            .
          </p>
        </header>
        {setup ? <p className="mt-8 text-sm leading-6 text-stone-600">{setup}</p> : <CampaignRoadmap milestones={milestones} />}
        {primaryId ? <DropoutButton primaryId={primaryId} /> : null}
      </div>
    </main>
  );
}
