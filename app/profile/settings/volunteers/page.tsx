import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VolunteerTable } from "@/app/profile/settings/volunteers/volunteer-table";
import { getVolunteerSignups, loadCampaignRaces, type VolunteerSignupRow } from "@/lib/actions/campaign";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volunteers · WHERE 2 RUN",
  description: "Review and export volunteer signups for a Frontrunner campaign.",
};

export default async function VolunteerDashboardPage() {
  const user = await getServerUser().catch(() => null);
  if (!user) redirect("/auth/login?next=%2Fprofile%2Fsettings%2Fvolunteers");

  let locked = false;
  let setup: string | null = null;
  const rows: VolunteerSignupRow[] = [];
  try {
    const races = (await loadCampaignRaces(user.id)).filter((race) => race.tier === "frontrunner");
    if (races.length === 0) {
      locked = true;
    } else {
      for (const race of races) {
        const result = await getVolunteerSignups(race.primaryId);
        if (result.error) {
          setup = result.error;
          break;
        }
        rows.push(...result.signups.filter((row) => row.status === "pending" || row.status === "accepted"));
      }
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load volunteers.";
    setup = isMissingSchema({ message })
      ? "Apply the volunteer manager migration, then reload."
      : message;
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10 pb-16">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">Campaign</p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
              Volunteers
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
              Pending and accepted signups for the primaries where you are a Frontrunner.
              Districts come from each volunteer&apos;s ballot. The street address stays private.
            </p>
          </div>
          {locked || setup ? null : (
            <a
              href="/api/export/volunteers"
              className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-900"
            >
              Export to CSV
            </a>
          )}
        </header>

        <div className="mt-4 flex flex-wrap gap-4">
          <Link
            href="/profile/settings"
            className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800 hover:text-stone-900"
          >
            Photo
          </Link>
          <Link
            href="/profile/settings/platform"
            className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800 hover:text-stone-900"
          >
            Campaign platform
          </Link>
          <Link
            href={`/profile/${user.id}`}
            className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800 hover:text-stone-900"
          >
            Public profile
          </Link>
        </div>

        {setup ? <p className="mt-8 text-sm leading-6 text-stone-600">{setup}</p> : null}

        {locked ? (
          <div className="mt-8 rounded-xl border border-amber-500/30 bg-white px-5 py-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-600">Locked</p>
            <p className="mt-3 text-sm leading-6 text-stone-900">
              The volunteer roster opens when you are a Frontrunner: top 10% Civic Standing in a primary,
              with Stripe verification and a legal name.
            </p>
          </div>
        ) : null}

        {!locked && !setup ? <VolunteerTable rows={rows} /> : null}
      </div>
    </main>
  );
}
