import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MilestoneUnlocks } from "@/components/campaign/MilestoneUnlocks";
import { DropoutButton } from "@/components/pledges/DropoutButton";
import { loadCampaignUnlocks } from "@/lib/campaign/load-unlocks";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaign Hub · WHERE 2 RUN",
  description: "District floor, contender promotion, and filing-fee escrow for the race you are exploring.",
};

export default async function CampaignHubPage(props: { searchParams: Promise<{ primary?: string }> }) {
  const primarySlug = (await props.searchParams).primary?.trim() || null;
  const user = await getServerUser().catch(() => null);
  if (!user) {
    const next = primarySlug
      ? `/campaign-hub?primary=${encodeURIComponent(primarySlug)}`
      : "/campaign-hub";
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const loaded = await loadCampaignUnlocks(user.id, primarySlug);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">Candidate</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">Campaign Hub</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Three unlocks between district floor access and a line on the official ballot. Day-to-day work stays in{" "}
            <Link href="/dashboard" className="text-amber-800">
              Candidate HQ
            </Link>
            .
          </p>
        </header>
        {loaded.notice ? <p className="mt-8 text-sm leading-6 text-stone-600">{loaded.notice}</p> : null}
        <MilestoneUnlocks unlocks={loaded.view} primaryHref={loaded.primaryHref} />
        {loaded.primaryId ? <DropoutButton primaryId={loaded.primaryId} /> : null}
      </div>
    </main>
  );
}
