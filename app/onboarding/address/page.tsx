import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddressForm } from "@/app/onboarding/address/address-form";
import { districtsFromOcdIds } from "@/lib/civic/voter-districts";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your address · WHERE 2 RUN",
  description: "Map a residential address to the districts on My Ballot.",
};

export default async function AddressOnboardingPage() {
  const user = await getServerUser().catch(() => null);
  if (!user) redirect("/auth/login?next=%2Fonboarding%2Faddress");

  let initial = null;
  try {
    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("ocd_ids")
      .eq("id", user.id)
      .maybeSingle();
    if (!error) {
      const ids = (data?.ocd_ids ?? []).filter((id): id is string => typeof id === "string");
      if (ids.length > 0) initial = districtsFromOcdIds(ids);
    } else if (!isMissingSchema(error)) {
      initial = null;
    }
  } catch {
    initial = null;
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">
            Onboarding
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
            Confirm your address
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            A street address maps to every overlapping seat on My Ballot: Congress, the
            state house, and the city. You can do this before or after the ideology
            diagnostic.
          </p>
          <Link
            href="/onboarding/ideology"
            className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800 hover:text-stone-900"
          >
            Ideology diagnostic
          </Link>
        </header>
        <AddressForm initial={initial} />
      </div>
    </main>
  );
}
