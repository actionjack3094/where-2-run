import type { Metadata } from "next";
import { DistrictGauntletForm } from "@/components/debates/DistrictGauntletForm";
import { OpenChallengeItem } from "@/components/debates/OpenChallengeItem";
import { UnansweredQuestionItem } from "@/components/debates/UnansweredQuestionItem";
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
    loadActionQueue(user?.id ?? null),
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
          <div className="mt-6">
            {queue.challenges.length === 0 ? (
              queue.notice ? null : (
                <p className="py-6 text-sm text-stone-600">No stances are waiting for an opponent.</p>
              )
            ) : (
              queue.challenges.map((challenge) => <OpenChallengeItem key={challenge.id} challenge={challenge} />)
            )}
          </div>
        ) : (
          <div className="mt-6">
            {queue.questions.length === 0 ? (
              queue.notice ? null : (
                <p className="py-6 text-sm text-stone-600">Every fresh agenda question has a first response.</p>
              )
            ) : (
              queue.questions.map((question) => <UnansweredQuestionItem key={question.id} question={question} />)
            )}
          </div>
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
