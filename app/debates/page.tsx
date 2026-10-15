import type { Metadata } from "next";
import Link from "next/link";
import { DistrictGauntletForm } from "@/components/debates/DistrictGauntletForm";
import { LaneTabs } from "@/components/lane-tabs";
import { loadActionQueue } from "@/lib/debates/action-queue";
import { loadDistrictGauntlet } from "@/lib/debates/load-gauntlet";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Debates · WHERE 2 RUN",
  description: "Open challenges and constituent questions waiting for a first response.",
};

export default async function DebatesPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await props.searchParams).tab === "questions" ? "questions" : "open";
  const user = await getServerUser();
  const [queue, gauntlet] = await Promise.all([
    loadActionQueue(),
    tab === "open" && user?.id ? loadDistrictGauntlet(user.id).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8">
        <LaneTabs
          label="Debates"
          tabs={[
            { href: "/debates", label: "Open Challenges", active: tab === "open" },
            { href: "/debates?tab=questions", label: "Unanswered Questions", active: tab === "questions" },
          ]}
        />
        <header className="mt-6">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">Debates</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            A 1,000-character opening, then a 48-hour rebuttal and Q&A window.
          </p>
        </header>

        {queue.notice ? <p className="mt-6 text-sm leading-6 text-stone-600">{queue.notice}</p> : null}

        {tab === "open" ? (
          <ul className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
            {queue.challenges.length === 0 ? (
              <li className="py-6 text-sm text-stone-600">No stances are waiting for an opponent.</li>
            ) : (
              queue.challenges.map((challenge) => (
                <li key={challenge.id} className="py-5">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-amber-800">
                    {challenge.party} · {challenge.office}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-800">{challenge.stance}</p>
                  <Link
                    href={`/debates/${challenge.id}`}
                    className="mt-3 inline-flex h-10 items-center text-[11px] font-semibold uppercase tracking-widest text-amber-800"
                  >
                    Accept the clash
                  </Link>
                </li>
              ))
            )}
          </ul>
        ) : (
          <ul className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
            {queue.questions.length === 0 ? (
              <li className="py-6 text-sm text-stone-600">Every fresh agenda question has a first response.</li>
            ) : (
              queue.questions.map((question) => (
                <li key={question.id} className="py-5">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-amber-800">{question.office}</p>
                  <h2 className="mt-2 text-base font-semibold text-stone-900">{question.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{question.content}</p>
                  {question.primarySlug ? (
                    <Link
                      href={`/debates/create?primary=${question.primarySlug}`}
                      className="mt-3 inline-flex h-10 items-center text-[11px] font-semibold uppercase tracking-widest text-amber-800"
                    >
                      Take the Floor
                    </Link>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        )}

        {gauntlet ? (
          <div className="py-5">
            <DistrictGauntletForm
              primaryId={gauntlet.primaryId}
              office={gauntlet.office}
              prompts={gauntlet.prompts}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
