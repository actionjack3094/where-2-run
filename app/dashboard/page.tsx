"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FeedView = "district" | "campaigns";

const FEEDS: { id: FeedView; label: string; hint: string }[] = [
  {
    id: "district",
    label: "My District",
    hint: "Voter view. Races on your local, state, and federal ballots.",
  },
  {
    id: "campaigns",
    label: "My Campaigns",
    hint: "Candidate view. Seats you have filed, scored by electability.",
  },
];

const LEVELS = [
  {
    id: "local",
    label: "Local",
    empty: {
      district: {
        title: "No local races matched",
        body: "City, county, and school-board elections in your ZIP will land here.",
      },
      campaigns: {
        title: "No local campaigns filed",
        body: "Local eligibility is off by default. Verify residency, then file a seat.",
      },
    },
  },
  {
    id: "state",
    label: "State",
    empty: {
      district: {
        title: "No state races matched",
        body: "Legislative and statewide contests tied to your residency will show here.",
      },
      campaigns: {
        title: "No state campaigns filed",
        body: "Once you target a state district, electability for that seat appears here.",
      },
    },
  },
  {
    id: "federal",
    label: "Federal",
    empty: {
      district: {
        title: "No federal races matched",
        body: "House, Senate, and presidential matchups on your ballot will collect here.",
      },
      campaigns: {
        title: "No federal campaigns filed",
        body: "Federal eligibility is on by default. File a district to open this column.",
      },
    },
  },
] as const;

export default function TriageDashboardPage() {
  const [feed, setFeed] = useState<FeedView>("district");
  const active = FEEDS.find((entry) => entry.id === feed) ?? FEEDS[0];

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/"
            className="w-fit text-xs font-medium uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50"
          >
            Where 2 Run
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Triage</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
            {active.hint}
          </p>
        </div>
        <FeedToggle value={feed} onChange={setFeed} />
      </div>

      <section className="mt-10 grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
        {LEVELS.map((level) => {
          const empty = level.empty[feed];
          return (
            <Card
              key={level.id}
              className="flex min-h-[22rem] max-h-[70vh] flex-col overflow-hidden dark:bg-zinc-950"
            >
              <CardHeader className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                    {level.label}
                  </p>
                  <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    {feed === "district" ? "Ballot" : "Filing"}
                  </span>
                </div>
                <CardTitle className="text-lg">Matched elections</CardTitle>
                <CardDescription>
                  {feed === "district"
                    ? `Voter feed · ${level.label.toLowerCase()} district`
                    : `Campaign feed · ${level.label.toLowerCase()} seats`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col overflow-y-auto pt-4">
                <div className="flex flex-1 flex-col items-start justify-center py-8">
                  <p className="text-sm font-medium tracking-tight text-zinc-950 dark:text-zinc-50">
                    {empty.title}
                  </p>
                  <p className="mt-2 max-w-[16rem] text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                    {empty.body}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </main>
  );
}

function FeedToggle({
  value,
  onChange,
}: {
  value: FeedView;
  onChange: (next: FeedView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard feed"
      className="inline-flex w-fit rounded-full border border-zinc-200 p-1 dark:border-zinc-800"
    >
      {FEEDS.map((entry) => {
        const selected = value === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(entry.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[11px] font-medium uppercase tracking-widest transition-colors",
              selected
                ? "bg-zinc-950 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
            )}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}
