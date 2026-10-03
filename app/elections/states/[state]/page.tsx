import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoTooltip, CIVIC_STANDING_TIP } from "@/components/InfoTooltip";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { loadPrimaries, platformAdmin } from "@/lib/platform/records";
import { stateByCode, type ElectionLevel } from "@/lib/platform/states";
import { partyLabel } from "@/lib/platform/types";
import type { Primary } from "@/types/database.types";

export const dynamic = "force-dynamic";

type StatePageProps = {
  params: Promise<{ state: string }>;
  searchParams: Promise<{ level?: string }>;
};

const LEVELS: { id: ElectionLevel; label: string }[] = [
  { id: "federal", label: "Federal" },
  { id: "state", label: "State" },
  { id: "local", label: "Local" },
];

function asLevel(value: string | undefined): ElectionLevel {
  if (value === "state" || value === "local") return value;
  return "federal";
}

export async function generateMetadata(props: StatePageProps): Promise<Metadata> {
  const { state } = await props.params;
  const match = stateByCode(state);
  return { title: match ? `${match.name} elections · WHERE 2 RUN` : "Elections · WHERE 2 RUN" };
}

export default async function StateElectionsPage(props: StatePageProps) {
  const { state } = await props.params;
  const searchParams = await props.searchParams;
  const match = stateByCode(state);
  if (!match) notFound();
  const level = asLevel(searchParams.level);

  let primaries: Primary[] = [];
  let setup: string | null = null;
  try {
    primaries = await loadPrimaries(platformAdmin());
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load elections.";
    setup = isMissingSchema({ message })
      ? "Apply the civic rebrand migration, then reload."
      : message;
  }

  const seats = new Map<string, Primary[]>();
  for (const primary of primaries) {
    if (primary.state.trim().toUpperCase() !== match.code) continue;
    if ((primary.level === "state" || primary.level === "local" ? primary.level : "federal") !== level) {
      continue;
    }
    const list = seats.get(primary.general_slug) ?? [];
    list.push(primary);
    seats.set(primary.general_slug, list);
  }
  const cards = [...seats.values()].sort((a, b) => a[0].office_name.localeCompare(b[0].office_name));

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <Link href="/elections/states" className="text-[11px] uppercase tracking-[0.2em] text-gold">
          All states
        </Link>
        <header className="mt-4">
          <h1 className="inline-flex items-center gap-2 font-display text-3xl font-semibold tracking-tight text-parchment">
            {match.name}
            <InfoTooltip label="Civic Standing" text={CIVIC_STANDING_TIP} />
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Elections filed in {match.code}.</p>
        </header>

        <nav className="mt-6 flex gap-2" aria-label="Election level">
          {LEVELS.map((tab) => {
            const active = tab.id === level;
            return (
              <Link
                key={tab.id}
                href={`/elections/states/${match.code}?level=${tab.id}`}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-full bg-gold px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-950"
                    : "rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:border-zinc-500"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {setup ? <p className="mt-8 text-sm text-zinc-300">{setup}</p> : null}
        {cards.length === 0 && !setup ? (
          <p className="mt-8 text-sm text-zinc-400">No {level} elections in {match.name} yet.</p>
        ) : (
          <ul className="mt-8 grid gap-3">
            {cards.map((rows) => {
              const primary = rows[0];
              const seat = primary.district ? `${primary.state}-${primary.district}` : primary.state;
              return (
                <li key={primary.general_slug}>
                  <Link
                    href={`/elections/${primary.slug}`}
                    className="block rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 transition-colors hover:border-zinc-600"
                  >
                    <p className="text-sm font-medium text-parchment">
                      {primary.office_name}
                      {` · ${seat}`}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-zinc-500">
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
