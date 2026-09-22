import type { Metadata } from "next";
import Link from "next/link";
import { OnboardingWizard } from "./components/OnboardingWizard";

export const metadata: Metadata = {
  title: "Candidate Onboarding · WHERE 2 RUN",
  description:
    "File identity, calibrate a policy vector, and accept the Conduit PAC terms to open a public candidate ticket.",
};

export default function OnboardingPage() {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Candidate filing
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Onboarding
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Three steps to a public ticket: identity, a Likert policy vector, then the
            Conduit PAC agreement. Filing writes your ideology vector and opens the
            campaign page.
          </p>
          <Link
            href="/onboarding/ideology"
            className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
          >
            Named stance vector quiz
          </Link>
        </header>
        <OnboardingWizard />
      </div>
    </main>
  );
}
