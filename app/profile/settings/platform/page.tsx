import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlatformEditor } from "@/app/profile/settings/platform/platform-editor";
import { loadCampaignRaces } from "@/lib/actions/campaign";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaign platform · WHERE 2 RUN",
  description: "Publish a manifesto and three policy pillars for a primary.",
};

export default async function CampaignPlatformSettingsPage() {
  const user = await getServerUser().catch(() => null);
  if (!user) redirect("/auth/login?next=%2Fprofile%2Fsettings%2Fplatform");

  let races: Awaited<ReturnType<typeof loadCampaignRaces>> = [];
  let setup: string | null = null;
  try {
    races = await loadCampaignRaces(user.id);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load your primaries.";
    setup = isMissingSchema({ message })
      ? "Apply the campaign platform migration, then reload."
      : message;
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Campaign</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Campaign platform
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Declared Candidates and Frontrunners publish a manifesto and up to three policy
            pillars for each primary they lead.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link
              href="/profile/settings"
              className="inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Photo
            </Link>
            <Link
              href="/profile/settings/volunteers"
              className="inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Volunteers
            </Link>
            <Link
              href={`/profile/${user.id}`}
              className="inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Public profile
            </Link>
          </div>
        </header>

        {setup ? <p className="mt-8 text-sm leading-6 text-zinc-300">{setup}</p> : null}

        {!setup && races.length === 0 ? (
          <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Locked
            </p>
            <p className="mt-3 text-sm leading-6 text-parchment">
              Campaign publishing opens when you reach the top 50% Civic Standing in a primary, Stripe has
              verified your identity, and a legal name is on the profile.
            </p>
            <Link
              href="/verify"
              className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Verify identity
            </Link>
          </div>
        ) : null}

        {!setup && races.length > 0 ? <PlatformEditor races={races} /> : null}
      </div>
    </main>
  );
}
