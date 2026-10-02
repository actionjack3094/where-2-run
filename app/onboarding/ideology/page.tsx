import type { Metadata } from "next";
import Link from "next/link";
import { DiagnosticQuiz } from "@/components/platform/DiagnosticQuiz";

export const metadata: Metadata = {
  title: "Ideology diagnostic · WHERE 2 RUN",
  description: "Twelve questions place you on the economic and social plane.",
};

export default function IdeologyOnboardingPage() {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Onboarding
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Ideology diagnostic
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Six economic questions and six social questions. Your answers set the
            coordinate Debates uses to match primaries.
          </p>
          <Link
            href="/debates"
            className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
          >
            Back to Debates
          </Link>
        </header>
        <DiagnosticQuiz />
      </div>
    </main>
  );
}
