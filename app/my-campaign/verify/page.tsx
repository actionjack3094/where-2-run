import type { Metadata } from "next";
import Link from "next/link";
import { VerificationDesk } from "@/components/verification/VerificationDesk";

export const metadata: Metadata = {
  title: "Identity Verification · WHERE 2 RUN",
  description:
    "Climb the identity ladder: SMS for baseline, voter file match for District Watch, and government ID for ballot access.",
};

export default async function VerifyPage() {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            My Campaign
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Verification Hub
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Civic fencing keeps District Watch for registered voters. SMS is the
            baseline, a voter registration file match unlocks voting rights, and a
            government ID review opens ballot access.
          </p>
          <Link
            href="/my-campaign"
            className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
          >
            Back to ideological engine
          </Link>
        </header>
        <VerificationDesk />
      </div>
    </main>
  );
}
