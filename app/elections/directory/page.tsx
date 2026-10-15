import type { Metadata } from "next";
import Link from "next/link";
import { electionsTabs, LaneTabs } from "@/components/lane-tabs";

export const metadata: Metadata = {
  title: "State Directory · WHERE 2 RUN",
  description: "Browse federal, state, and local elections.",
};

const TIERS = [
  {
    id: "federal",
    title: "Federal",
    body: "President, Senate, and House seats.",
  },
  {
    id: "state",
    title: "State",
    body: "Governor, legislature, and statewide offices.",
  },
  {
    id: "local",
    title: "Local",
    body: "County, city, school, and municipal seats.",
  },
] as const;

export default function StateDirectoryPage() {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <LaneTabs label="Elections" tabs={electionsTabs("directory")} />
        <header className="mt-6">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">State Directory</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Pick a tier, then a state, to browse the races on that map.
          </p>
        </header>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {TIERS.map((tier) => (
            <li key={tier.id}>
              <Link
                href={`/elections/states?tier=${tier.id}`}
                className="flex min-h-44 flex-col justify-between rounded-2xl border border-amber-500/40 bg-white px-5 py-6 transition hover:-translate-y-0.5 hover:border-amber-600"
              >
                <span className="font-display text-2xl font-semibold tracking-tight text-stone-900">{tier.title}</span>
                <span className="mt-6 text-sm leading-6 text-stone-600">{tier.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
