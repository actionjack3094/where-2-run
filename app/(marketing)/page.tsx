import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Radar, ShieldCheck, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getServerUser } from "@/lib/db/supabase-server";

export const metadata: Metadata = {
  title: "WHERE 2 RUN",
  description:
    "Match a six-axis policy vector, watch time-boxed debates, and let verified local constituents cast the deciding votes.",
};

const SIGN_UP_HREF = "/auth/login?mode=create";

const PILLARS = [
  {
    step: "01",
    title: "Stance Matching",
    body: "Find candidates using 6-axis policy vector math. Positions become a coordinate, and the closest candidates surface first.",
    icon: Radar,
  },
  {
    step: "02",
    title: "Time-Boxed Debates",
    body: "Watch candidates defend their positions in structured arenas. The floor opens on a clock, and the argument has to hold.",
    icon: Timer,
  },
  {
    step: "03",
    title: "Civic Fencing",
    body: "Only verified local constituents cast the deciding votes. Everyone else can read the floor. They cannot decide it.",
    icon: ShieldCheck,
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
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-gold">
          Public arena
        </p>
        <h1 className="mt-5 max-w-3xl font-display text-5xl font-semibold leading-[1.05] tracking-tight text-parchment sm:text-6xl lg:text-7xl">
          The Civic Arena.{" "}
          <span className="text-gold">No soundbites. Just substance.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
          Score where you stand on six policy axes, watch candidates defend those
          positions in a timed arena, then leave the deciding ballots to verified
          constituents inside the district.
        </p>
        <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button
            asChild
            variant="gold"
            size="lg"
            className="h-auto min-h-12 whitespace-normal px-6 py-3 text-center text-xs leading-5 sm:text-sm"
          >
            <Link href={SIGN_UP_HREF}>Find Your Matches (Voters)</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-auto min-h-12 whitespace-normal px-6 py-3 text-center text-xs leading-5 sm:text-sm"
          >
            <Link href={SIGN_UP_HREF}>Enter the Arena (Candidates)</Link>
          </Button>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="border-t border-gold/30 pt-14">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
            The core loop
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            How it Works
          </h2>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <article
                key={pillar.title}
                className="flex flex-col rounded-xl border border-gold/40 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex size-10 items-center justify-center rounded-md border border-gold/40 bg-zinc-950 text-gold">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                    {pillar.step}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold tracking-tight text-parchment">
                  {pillar.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-zinc-400">{pillar.body}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
