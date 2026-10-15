import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ZipForm } from "@/app/onboarding/location/zip-form";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Voting ZIP · WHERE 2 RUN",
  description: "Save the ZIP code that opens your local ballot.",
};

export default async function OnboardingLocationPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/login?next=%2Fonboarding%2Flocation");

  const admin = createAdminClient();
  const profile = await admin.from("profiles").select("ideology_x, ideology_y").eq("id", user.id).maybeSingle();
  const row = profile.data as { ideology_x: number | null; ideology_y: number | null } | null;
  if (!profile.error && (row?.ideology_x == null || row?.ideology_y == null)) {
    redirect("/onboarding");
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">Step 3</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
            Where do you vote?
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Your voting ZIP code calculates which local races you can see on My Voter Ballot.
          </p>
        </header>
        <ZipForm />
      </div>
    </main>
  );
}
