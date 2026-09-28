import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { electionProfileHref } from "@/lib/election-links";
import { loadLeaderboardDashboard, type BoardPerson } from "@/lib/leaderboards/dashboard";
import { getServerUser } from "@/lib/db/supabase-server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboards · WHERE 2 RUN",
  description: "Matched elections, the global war room, grassroots policies, and the tightest arenas.",
};

export default async function LeaderboardsPage() {
  const user = await getServerUser();
  const dashboard = await loadLeaderboardDashboard(user?.id ?? null);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-[0.18em] text-parchment">
            LEADERBOARDS
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Your rank inside matched districts, the global field, backyard policies, and the closest races.
          </p>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="My Matched Elections" eyebrow="Your field">
            {!dashboard.matched.signedIn ? (
              <Empty>Sign in to see your rank inside matched districts.</Empty>
            ) : dashboard.matched.error ? (
              <Empty>{dashboard.matched.error}</Empty>
            ) : dashboard.matched.elections.length === 0 ? (
              <Empty>No ideological matches yet. Answer arena questions to sort into districts.</Empty>
            ) : (
              <div className="flex flex-col gap-5">
                <p className="text-sm leading-6 text-zinc-300">
                  {dashboard.matched.rank
                    ? `You are #${dashboard.matched.rank} of ${dashboard.matched.fieldSize} in these districts · ${dashboard.matched.elo} ELO`
                    : "You are not ranked in these districts yet."}
                </p>
                <ul className="flex flex-col gap-2">
                  {dashboard.matched.elections.map((election) => (
                    <li key={election.id}>
                      {election.slug ? (
                        <Link
                          href={electionProfileHref(election.slug)}
                          className="text-sm text-parchment hover:text-gold"
                        >
                          {election.name}
                        </Link>
                      ) : (
                        <span className="text-sm text-parchment">{election.name}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <PersonList people={dashboard.matched.board} />
              </div>
            )}
          </Panel>

          <Panel title="The War Room" eyebrow="Global">
            {dashboard.warRoom.error ? (
              <Empty>{dashboard.warRoom.error}</Empty>
            ) : dashboard.warRoom.people.length === 0 ? (
              <Empty>No candidates are on the board yet.</Empty>
            ) : (
              <PersonList people={dashboard.warRoom.people} />
            )}
          </Panel>

          <Panel title="Top Grassroots Policies" eyebrow="Blue cards">
            {!dashboard.grassroots.signedIn ? (
              <Empty>Sign in to see debates on your home ballot.</Empty>
            ) : dashboard.grassroots.error ? (
              <Empty>{dashboard.grassroots.error}</Empty>
            ) : dashboard.grassroots.policies.length === 0 ? (
              <Empty>No backyard debates on your home districts yet.</Empty>
            ) : (
              <ol className="flex flex-col gap-3">
                {dashboard.grassroots.policies.map((policy, index) => (
                  <li key={policy.id}>
                    <Link href={`/debates/${policy.id}`} className="group block">
                      <span className="font-display text-sm tabular-nums text-blue-300">
                        {index + 1}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-parchment group-hover:text-blue-200">
                        {policy.title}
                      </span>
                      <span className="mt-1 block text-[11px] uppercase tracking-widest text-zinc-500">
                        {policy.engagement} engagement · {policy.votes} votes · {policy.comments} comments
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Most Competitive Arenas" eyebrow="Tightest fields">
            {dashboard.arenas.error ? (
              <Empty>{dashboard.arenas.error}</Empty>
            ) : dashboard.arenas.races.length === 0 ? (
              <Empty>No race has three contenders yet.</Empty>
            ) : (
              <ol className="flex flex-col gap-4">
                {dashboard.arenas.races.map((race) => (
                  <li key={race.id} className="border-b border-white/5 pb-4 last:border-0 last:pb-0">
                    {race.slug ? (
                      <Link
                        href={electionProfileHref(race.slug)}
                        className="text-sm font-medium text-parchment hover:text-gold"
                      >
                        {race.name}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-parchment">{race.name}</p>
                    )}
                    <p className="mt-1 text-[11px] uppercase tracking-widest text-zinc-500">
                      Top 3 ELO spread {race.spread}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      {race.contenders.map((person) => `${person.name} ${person.elo}`).join(" · ")}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-72 flex-col rounded-xl border border-gold/30 bg-zinc-900 px-5 py-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">{eyebrow}</p>
      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-parchment">
        {title}
      </h2>
      <div className="mt-5 flex-1">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-zinc-400">{children}</p>;
}

function PersonList({ people }: { people: BoardPerson[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {people.map((person) => (
        <li key={person.id}>
          <Link
            href={`/candidate/${person.id}`}
            className={cn(
              "flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-white/5",
              person.isViewer && "bg-gold/10",
            )}
          >
            <span className="min-w-0 truncate text-parchment">
              <span className="mr-2 font-display tabular-nums text-gold">{person.rank}</span>
              {person.name}
            </span>
            <span className="shrink-0 text-[11px] uppercase tracking-widest text-zinc-500">
              {person.elo} ELO
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
