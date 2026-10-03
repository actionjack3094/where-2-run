import type { Metadata } from "next";
import Link from "next/link";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { primaryClosed } from "@/lib/platform/cycle";
import { loadPrimaryIndex } from "@/lib/platform/queries";
import { formatCoordinate, partyLabel } from "@/lib/platform/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Primary Hubs · WHERE 2 RUN",
  description: "Democratic and Republican primaries for each general election.",
};

export default async function PrimariesPage() {
  let groups: Awaited<ReturnType<typeof loadPrimaryIndex>> = [];
  let setup: string | null = null;
  try {
    groups = await loadPrimaryIndex();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load primaries.";
    setup = isMissingSchema({ message })
      ? "Apply the platform architecture migration, then reload."
      : message;
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Races</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Primary Hubs
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Every general election splits into a Democratic primary and a Republican primary.
          </p>
        </header>
        {setup ? <p className="mt-8 text-sm text-zinc-300">{setup}</p> : null}
        <div className="mt-8 grid gap-8">
          {groups.map((group) => (
            <section key={group.generalSlug}>
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{group.generalSlug}</h2>
              <div className="mt-3 grid gap-3">
                {group.primaries.map((primary) => {
                  const party = primary.party === "republican" ? "republican" : "democrat";
                  return (
                    <Link
                      key={primary.id}
                      href={`/primaries/${primary.slug}`}
                      className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 transition-colors hover:border-zinc-600"
                    >
                      <p className="text-sm font-medium text-parchment">
                        {partyLabel(party)} · {primary.office_name}
                        {primary.district ? ` ${primary.state}-${primary.district}` : ` · ${primary.state}`}
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">
                        Baseline {formatCoordinate(primary.baseline_x, primary.baseline_y)}
                      </p>
                      {primary.cycle_year ? (
                        <p className="mt-1 text-xs uppercase tracking-widest text-zinc-500">
                          {primary.cycle_year}
                          {primaryClosed(primary) ? " · Frozen" : " · Active"}
                        </p>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
