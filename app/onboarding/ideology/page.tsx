import type { Metadata } from "next";
import Link from "next/link";
import { IdeologyQuiz } from "@/components/onboarding/IdeologyQuiz";

export const metadata: Metadata = {
  title: "Ideological Baseline · WHERE 2 RUN",
  description:
    "File a five-question stance vector across economy, foreign policy, social issues, climate, and immigration.",
};

export default async function IdeologyOnboardingPage() {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Onboarding
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Ideological Engine
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Five baseline questions. Sliders and distinct options map onto named
            coordinates from −1.0 to 1.0. Filing writes your stance vector, then
            opens the War Room.
          </p>
          <Link
            href="/my-campaign"
            className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
          >
            Skip to War Room
          </Link>
        </header>
        <IdeologyQuiz />
      </div>
    </main>
  );
}
