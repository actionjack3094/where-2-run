import type { Metadata } from "next";
import Link from "next/link";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { loadHomeOcdIds, loadPrimaries, ocdMatches, platformAdmin } from "@/lib/platform/records";
import { partyLabel } from "@/lib/platform/types";
import type { Primary } from "@/types/database.types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Ballot Elections · WHERE 2 RUN",
  description: "Elections that match your verified home address.",
};

export default async function MyBallotElectionsPage() {
  const user = await getServerUser();
  let primaries: Primary[] = [];
  let setup: string | null = null;
  let needsAddress = false;

  if (!user) {
    return (
      <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
          <Link href="/elections" className="text-[11px] uppercase tracking-[0.2em] text-amber-800">
            Elections
          </Link>
          <h1 className="mt-4 font-display text-3xl font-semibold text-stone-900">My Ballot Elections</h1>
          <p className="mt-4 text-sm text-stone-600">
            <Link href="/auth/login" className="text-amber-800">
              Sign in
            </Link>{" "}
            to see the races on your address.
          </p>
        </div>
      </main>
    );
  }

  try {
    const admin = platformAdmin();
    const home = await loadHomeOcdIds(admin, user.id);
    needsAddress = home.length === 0;
    if (!needsAddress) {
      primaries = (await loadPrimaries(admin)).filter((primary) => ocdMatches(home, primary.ocd_id));
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load your ballot.";
    setup = isMissingSchema({ message })
      ? "Apply the civic rebrand migration, then reload."
      : message;
  }

  const seats = new Map<string, Primary[]>();
  for (const primary of primaries) {
    const list = seats.get(primary.general_slug) ?? [];
    list.push(primary);
    seats.set(primary.general_slug, list);
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <Link href="/elections" className="text-[11px] uppercase tracking-[0.2em] text-amber-800">
          Elections
        </Link>
        <header className="mt-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">My Ballot Elections</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Seats whose district is on your verified home address.
          </p>
        </header>
        {setup ? <p className="mt-8 text-sm text-stone-600">{setup}</p> : null}
        {needsAddress ? (
          <Link href="/onboarding/address" className="mt-8 block rounded-xl border border-gold px-5 py-4 text-sm text-stone-900">
            Add your home address to unlock these races.
          </Link>
        ) : null}
        {!setup && !needsAddress && seats.size === 0 ? (
          <p className="mt-8 text-sm text-stone-600">No elections match your address yet.</p>
        ) : (
          <ul className="mt-8 grid gap-3">
            {[...seats.values()].map((rows) => {
              const primary = rows[0];
              const seat = primary.district ? `${primary.state}-${primary.district}` : primary.state;
              return (
                <li key={primary.general_slug}>
                  <Link
                    href={`/elections/${primary.slug}`}
                    className="block rounded-xl border border-amber-500/30 bg-white px-5 py-4 transition-colors hover:border-amber-600"
                  >
                    <p className="text-sm font-medium text-stone-900">
                      {primary.office_name} · {seat}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-stone-600">
                      {rows.map((row) => partyLabel(row.party)).join(" · ")}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
