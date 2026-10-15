import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DiagnosticForm } from "@/app/onboarding/diagnostic-form";
import { getServerUser } from "@/lib/db/supabase-server";

export const metadata: Metadata = {
  title: "Onboarding · WHERE 2 RUN",
  description: "Eight questions place you on the economic and governance plane.",
};

export default async function OnboardingPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/login?mode=create&next=%2Fonboarding");

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">Step 1</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
            Find your vector
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Four economic questions set the horizontal axis. Four governance questions set the
            vertical axis. Later questions follow the direction of your earlier answers.
          </p>
        </header>
        <DiagnosticForm />
      </div>
    </main>
  );
}
