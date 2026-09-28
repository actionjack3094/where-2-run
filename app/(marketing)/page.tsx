import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getServerUser } from "@/lib/db/supabase-server";

export const metadata: Metadata = {
  title: "WHERE 2 RUN",
  description:
    "Match a six-axis policy vector, watch time-boxed debates, and let verified local constituents cast the deciding votes.",
};

const SIGN_UP_HREF = "/auth/login?mode=create";

const TRACKS = [
  {
    title: "The Policy Track (Citizens)",
    accent: "border-blue-700/30 shadow-[inset_3px_0_0_0_rgba(29,78,216,0.45)]",
    steps: [
      "Map your real ballot.",
      "Vote and comment on local debates.",
      "Elevate policies you care about.",
    ],
  },
  {
    title: "The Campaign Track (Contenders)",
    accent: "border-red-800/25 shadow-[inset_3px_0_0_0_rgba(190,18,60,0.4)]",
    steps: [
      "Match your ideology to winnable elections.",
      "Debate peers to elevate your rank.",
      "Target a race, unlock pledged donations, and run.",
    ],
  },
] as const;

export default async function Home() {
  const user = await getServerUser();
  if (user) {
    redirect("/feed");
  }

  return (
    <main className="relative flex w-full flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--gold)_16%,transparent),transparent_68%)]" />

      <section className="relative mx-auto flex w-full max-w-4xl flex-col items-start px-6 pb-16 pt-20 sm:pt-28">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-brass">
          Public arena
        </p>
        <h1 className="mt-5 max-w-3xl font-display text-5xl font-semibold leading-[1.05] tracking-tight text-charcoal sm:text-6xl lg:text-7xl">
          The Civic Arena.{" "}
          <span className="text-brass">No soundbites. Just substance.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-charcoal-muted sm:text-lg sm:leading-8">
          Score where you stand on six policy axes, watch candidates defend those
          positions in a timed arena, then leave the deciding ballots to verified
          constituents inside the district.
        </p>
        <div className="mt-10">
          <Button
            asChild
            variant="gold"
            size="lg"
            className="h-auto min-h-12 whitespace-normal px-6 py-3 text-center text-xs leading-5 sm:text-sm"
          >
            <Link href={SIGN_UP_HREF}>Enter the Arena</Link>
          </Button>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="border-t border-brass/30 pt-14">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-charcoal-muted">
            The core loop
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-charcoal">
            How it Works
          </h2>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {TRACKS.map((track) => (
            <article
              key={track.title}
              className={`flex flex-col rounded-xl border bg-parchment-light p-6 ${track.accent}`}
            >
              <h3 className="font-display text-xl font-semibold tracking-tight text-charcoal">
                {track.title}
              </h3>
              <ol className="mt-6 flex flex-col gap-4">
                {track.steps.map((step, index) => (
                  <li key={step} className="flex gap-4 text-sm leading-6 text-charcoal">
                    <span className="font-display text-base text-brass">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
