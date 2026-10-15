import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TownhallGate } from "@/app/townhall/townhall-gate";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import { readTownhallAnswers, type TownhallAnswer } from "@/lib/onboarding/townhall";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Townhall · WHERE 2 RUN",
  description:
    "Wedge questions raise match confidence from the onboarding baseline toward 90 percent.",
};

export default async function TownhallPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/login?mode=create&next=%2Ftownhall");

  let saved: TownhallAnswer[] | null = null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_ideologies")
      .select("vector_data")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!error) saved = readTownhallAnswers(data?.vector_data);
  } catch (caught) {
    console.error(
      "Could not load a filed Townhall.",
      caught instanceof Error ? caught.message : "Unknown error",
    );
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">
            Calibration Lab
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
            Townhall
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Wedge questions follow the uncertainty in your vector and the battlegrounds
            in your matched districts. Each answer pushes match confidence up from the
            68% onboarding baseline. Skip Question leaves the vector where it is.
          </p>
        </header>
        <TownhallGate saved={saved} />
      </div>
    </main>
  );
}
