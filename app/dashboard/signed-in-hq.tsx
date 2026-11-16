import Link from "next/link";
import { IdentityPanel, PlatformPanel } from "@/app/dashboard/hq-account";
import { QueuePanel, SoapboxPanel, VolunteerPanel } from "@/app/dashboard/hq-floor";
import { asHqTab, loadAccount, loadFloor } from "@/app/dashboard/hq-load";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { displayName, loadProfile, platformAdmin } from "@/lib/platform/records";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "queue", label: "Debater Queue" },
  { id: "soapbox", label: "Soapbox" },
  { id: "volunteers", label: "Volunteer Roster" },
] as const;

export async function SignedInHq({
  userId,
  searchParams,
}: {
  userId: string;
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = asHqTab((await searchParams).tab);
  const admin = platformAdmin();
  let name = "Contender";
  let avatarUrl: string | null = null;
  let verified = false;
  let ideologyX = 0;
  let ideologyY = 0;
  let hasCoordinate = false;
  let setup: string | null = null;

  try {
    const profile = await loadProfile(admin, userId);
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

  const floor = await loadFloor(tab, userId);
  const account = await loadAccount(tab, userId);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">Candidate</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">Candidate HQ</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            The queue, your Soapbox, and the people who enlisted. The milestone map lives in{" "}
            <Link href="/campaign-hub" className="text-amber-800">
              Campaign Hub
            </Link>
            .
          </p>
          <p className="mt-3 flex flex-wrap gap-4 text-[11px] uppercase tracking-widest">
            <Link href="/dashboard?tab=identity" className="text-stone-600 hover:text-amber-800">
              Identity
            </Link>
            <Link href="/dashboard?tab=platform" className="text-stone-600 hover:text-amber-800">
              Platform
            </Link>
          </p>
        </header>
        <div role="tablist" aria-label="Candidate HQ" className="mt-8 flex flex-wrap gap-2">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <Link
                key={item.id}
                href={item.id === "queue" ? "/dashboard" : `/dashboard?tab=${item.id}`}
                role="tab"
                aria-selected={selected}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest transition-colors",
                  selected
                    ? "bg-gold-strong text-stone-900"
                    : "border border-gold/40 text-stone-600 hover:border-gold hover:text-stone-900",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        {tab === "queue" ? <QueuePanel queue={floor.queue} error={floor.queueError} /> : null}
        {tab === "soapbox" ? <SoapboxPanel soapbox={floor.soapbox} error={floor.soapboxError} /> : null}
        {tab === "volunteers" ? <VolunteerPanel volunteers={floor.volunteers} error={floor.groundError} /> : null}
        {tab === "identity" ? (
          <IdentityPanel
            userId={userId}
            name={name}
            avatarUrl={avatarUrl}
            verified={verified}
            setup={setup}
            ideologyX={ideologyX}
            ideologyY={ideologyY}
            hasCoordinate={hasCoordinate}
          />
        ) : null}
        {tab === "platform" ? <PlatformPanel races={account.races} error={account.platformError} /> : null}
      </div>
    </main>
  );
}
