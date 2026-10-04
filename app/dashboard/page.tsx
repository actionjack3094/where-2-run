import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DisplayNameForm } from "@/app/dashboard/display-name-form";
import { AvatarUpload } from "@/app/profile/settings/avatar-upload";
import { PlatformEditor } from "@/app/profile/settings/platform/platform-editor";
import { VolunteerTable } from "@/app/profile/settings/volunteers/volunteer-table";
import { IdeologyCompass, compassFromPlane } from "@/components/IdeologyCompass";
import { getVolunteerSignups, loadCampaignRaces, type VolunteerSignupRow } from "@/lib/actions/campaign";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { displayName, loadProfile, platformAdmin } from "@/lib/platform/records";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Candidate HQ · WHERE 2 RUN",
  description: "Identity, campaign platform, and ground game in one place.",
};

const TABS = [
  { id: "identity", label: "Identity & Compass" },
  { id: "platform", label: "Platform" },
  { id: "ground", label: "Ground Game" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function asTab(value: string | undefined): TabId {
  if (value === "platform" || value === "ground") return value;
  return "identity";
}

export default async function CandidateHqPage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getServerUser().catch(() => null);
  if (!user) redirect("/auth/login?next=%2Fdashboard");

  const tab = asTab((await props.searchParams).tab);
  const admin = platformAdmin();

  let name = "Contender";
  let avatarUrl: string | null = null;
  let verified = false;
  let ideologyX = 0;
  let ideologyY = 0;
  let hasCoordinate = false;
  let setup: string | null = null;

  try {
    const profile = await loadProfile(admin, user.id);
    if (profile) {
      name = displayName(profile);
      avatarUrl = profile.avatar_url;
      verified = profile.is_verified || profile.tier2_status === "verified";
      if (profile.ideology_x != null && profile.ideology_y != null) {
        ideologyX = profile.ideology_x;
        ideologyY = profile.ideology_y;
        hasCoordinate = true;
      }
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load your profile.";
    setup = isMissingSchema({ message }) ? "Apply the profile migration, then reload." : message;
  }

  let races: Awaited<ReturnType<typeof loadCampaignRaces>> = [];
  let platformError: string | null = null;
  if (tab === "platform") {
    try {
      races = await loadCampaignRaces(user.id);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load your primaries.";
      platformError = isMissingSchema({ message })
        ? "Apply the campaign platform migration, then reload."
        : message;
    }
  }

  let groundLocked = false;
  let groundError: string | null = null;
  const volunteers: VolunteerSignupRow[] = [];
  if (tab === "ground") {
    try {
      const frontrunner = (await loadCampaignRaces(user.id)).filter((race) => race.tier === "frontrunner");
      if (frontrunner.length === 0) {
        groundLocked = true;
      } else {
        for (const race of frontrunner) {
          const result = await getVolunteerSignups(race.primaryId);
          if (result.error) {
            groundError = result.error;
            break;
          }
          volunteers.push(
            ...result.signups.filter(
              (row) => row.status === "pending" || row.status === "accepted" || row.status === "contacted",
            ),
          );
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load volunteers.";
      groundError = isMissingSchema({ message })
        ? "Apply the volunteer manager migration, then reload."
        : message;
    }
  }

  const point = compassFromPlane(ideologyX, ideologyY);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Candidate</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Candidate HQ
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Photo, name, platform, and ground game for the primaries you are contesting.
          </p>
        </header>

        <div role="tablist" aria-label="Candidate HQ" className="mt-8 flex flex-wrap gap-2">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <Link
                key={item.id}
                href={item.id === "identity" ? "/dashboard" : `/dashboard?tab=${item.id}`}
                role="tab"
                aria-selected={selected}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest transition-colors",
                  selected
                    ? "bg-gold-strong text-zinc-950"
                    : "border border-gold/40 text-zinc-400 hover:border-gold hover:text-parchment",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {tab === "identity" ? (
          <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
            <div className="grid gap-6">
              {setup ? <p className="text-sm leading-6 text-zinc-300">{setup}</p> : null}
              {setup ? null : (
                <>
                  <AvatarUpload userId={user.id} name={name} avatarUrl={avatarUrl} />
                  <DisplayNameForm name={name} />
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Stripe KYC
                    </p>
                    {verified ? (
                      <p className="mt-3 inline-flex rounded-full border border-gold px-3 py-1 text-[11px] uppercase tracking-widest text-gold">
                        Verified
                      </p>
                    ) : (
                      <>
                        <p className="mt-3 text-sm leading-6 text-zinc-300">
                          Stripe verification and a legal name are required before a primary leaderboard
                          can list you as a Declared Candidate or Frontrunner.
                        </p>
                        <Link
                          href="/verify"
                          className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
                        >
                          Verify identity
                        </Link>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                Ideology Compass
              </p>
              <div className="mt-4">
                <IdeologyCompass
                  points={[{ x: point.x, y: point.y, name, avatarUrl }]}
                  className="mx-auto w-full max-w-sm"
                />
              </div>
              <p className="mt-4 text-center text-sm leading-6 text-zinc-400">
                {hasCoordinate
                  ? `Economic ${ideologyX.toFixed(2)} · Social ${ideologyY.toFixed(2)}`
                  : "Your coordinate appears after onboarding. Debate scores move only your own point."}
              </p>
            </div>
          </section>
        ) : null}

        {tab === "platform" ? (
          <section className="mt-8 max-w-xl">
            {platformError ? <p className="text-sm leading-6 text-zinc-300">{platformError}</p> : null}
            {!platformError && races.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">Locked</p>
                <p className="mt-3 text-sm leading-6 text-parchment">
                  The platform editor opens at Declared Candidate: top 50% Civic Standing in a primary,
                  with Stripe verification and a legal name on the profile.
                </p>
                <Link
                  href="/verify"
                  className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
                >
                  Verify identity
                </Link>
              </div>
            ) : null}
            {!platformError && races.length > 0 ? <PlatformEditor races={races} /> : null}
          </section>
        ) : null}

        {tab === "ground" ? (
          <section className="mt-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-xl text-sm leading-6 text-zinc-400">
                Pending, accepted, and contacted volunteers for primaries where you are a Frontrunner.
                Districts come from each volunteer&apos;s ballot. The street address stays private.
              </p>
              {groundLocked || groundError ? null : (
                <a
                  href="/api/export/volunteers"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-950"
                >
                  Export to CSV
                </a>
              )}
            </div>
            {groundError ? <p className="mt-8 text-sm leading-6 text-zinc-300">{groundError}</p> : null}
            {groundLocked ? (
              <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">Locked</p>
                <p className="mt-3 text-sm leading-6 text-parchment">
                  The volunteer roster opens at Frontrunner: top 10% Civic Standing in a primary, with
                  Stripe verification and a legal name.
                </p>
              </div>
            ) : null}
            {!groundLocked && !groundError ? <VolunteerTable rows={volunteers} /> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
