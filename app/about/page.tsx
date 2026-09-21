import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About Us · WHERE 2 RUN",
  description: "Why WHERE 2 RUN exists, and how candidates and spectators share the floor.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">About Us</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">The floor before the ballot.</h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-zinc-500 dark:text-zinc-400">
        WHERE 2 RUN is a mock civic arena. Candidates find a district that can actually elect
        them. Spectators watch the debate, cast a vote, and put a grassroots pledge behind the
        person who earned the room.
      </p>

      <section className="mt-12 space-y-8">
        <article>
          <h2 className="text-xl font-semibold tracking-tight">For candidates</h2>
          <p className="mt-2 text-sm leading-7 text-zinc-500 dark:text-zinc-400">
            Six policy questions become a 10-dimensional ideology vector. We score that vector
            against seeded district medians, then send you to a safe primary or a toss-up general.
            From there you open a topic, wait for a challenger, and argue on the clock.
          </p>
        </article>
        <article>
          <h2 className="text-xl font-semibold tracking-tight">For spectators</h2>
          <p className="mt-2 text-sm leading-7 text-zinc-500 dark:text-zinc-400">
            You are the room. Live arenas rank by ballots. Completed matches archive a winner.
            If a candidate still has your attention after the floor closes, you can back them with
            a pledge from any seat on the site.
          </p>
        </article>
        <article>
          <h2 className="text-xl font-semibold tracking-tight">This page is a stand-in</h2>
          <p className="mt-2 text-sm leading-7 text-zinc-500 dark:text-zinc-400">
            The product is real enough to quiz, debate, vote, and pledge. The organization behind
            it is not. Treat this as a placeholder until a real about page replaces it.
          </p>
        </article>
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/onboarding">Take the quiz</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/feed">Back to feed</Link>
        </Button>
      </div>
    </main>
  );
}
