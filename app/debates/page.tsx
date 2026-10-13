import type { Metadata } from "next";
import Link from "next/link";
import { ClashCard } from "@/app/debates/clash-card";
import { DistrictGauntletForm } from "@/components/debates/DistrictGauntletForm";
import { stanceIsStale } from "@/lib/ballot/fading";
import { loadDistrictGauntlet } from "@/lib/debates/load-gauntlet";
import { loadClashFeed } from "@/lib/debates/load-clash-feed";
import { platformAdmin } from "@/lib/platform/records";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Debates · WHERE 2 RUN",
  description: "A question-first feed of head-to-head primary debates.",
};

async function stanceIsStaleFor(userId: string) {
  const activity = await platformAdmin()
    .from("arena_debates")
    .select("updated_at")
    .or(`candidate_a_id.eq.${userId},candidate_b_id.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (activity.error) return false;
  const last = ((activity.data ?? []) as { updated_at: string }[])[0]?.updated_at ?? null;
  return stanceIsStale(last);
}

export default async function DebatesPage() {
  const user = await getServerUser();
  const [feed, gauntlet, stale] = await Promise.all([
    loadClashFeed(),
    user?.id ? loadDistrictGauntlet(user.id).catch(() => null) : Promise.resolve(null),
    user?.id ? stanceIsStaleFor(user.id).catch(() => false) : Promise.resolve(false),
  ]);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-center px-4">
          <h1
            className="text-sm font-semibold text-stone-900"
            style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
          >
            Debates
          </h1>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        {feed.notice ? (
          <p className="border-b border-stone-200 px-4 py-3 text-sm leading-6 text-stone-600">{feed.notice}</p>
        ) : null}
        {stale && user ? (
          <p className="border-b border-stone-200 px-4 py-3 text-sm leading-6 text-stone-600">
            Your stance is stale. File an update on the{" "}
            <Link href="/elections" className="text-amber-800">
              Agenda Queue
            </Link>{" "}
            so the match confidence can recover.
          </p>
        ) : null}

        {feed.cards.map((card, index) => (
          <ClashCard key={card.id} card={card} viewerId={user?.id ?? null} featured={index === 0} />
        ))}

        {gauntlet ? (
          <div className="px-4 py-5">
            <DistrictGauntletForm
              primaryId={gauntlet.primaryId}
              office={gauntlet.office}
              prompts={gauntlet.prompts}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
