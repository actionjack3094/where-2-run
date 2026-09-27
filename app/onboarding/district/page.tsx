import type { Metadata } from "next";
import { DistrictForm, type DistrictOption } from "@/app/onboarding/district/district-form";
import { createServerSupabase } from "@/lib/db/supabase-server";

export const metadata: Metadata = {
  title: "Verify your district · WHERE 2 RUN",
  description: "Choose the local district that fences your civic feed and voter matchmaking.",
};

export default async function DistrictOnboardingPage() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("districts")
    .select("id, name, level, state")
    .order("name", { ascending: true });

  const districts = ((data ?? []) as DistrictOption[]).filter((district) => district.id && district.name);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Onboarding
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Verify your local district
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Your district fences the civic feed and the candidates you can match with.
          </p>
        </header>

        {error ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">{error.message}</p>
        ) : districts.length === 0 ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            No districts are available yet.
          </p>
        ) : (
          <DistrictForm districts={districts} />
        )}
      </div>
    </main>
  );
}
