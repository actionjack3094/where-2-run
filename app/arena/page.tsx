import type { Metadata } from "next";
import Link from "next/link";
import { CreateDebateButton } from "@/app/arena/components/CreateDebateButton";
import { DebateCard } from "@/app/arena/components/DebateCard";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadArenaFeed } from "@/lib/arena/feed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public Arena · WHERE 2 RUN",
  description:
    "Watch vector-matched debates, escrow a bounty on the winner, and appeal a marginal AI verdict to a local jury.",
};

export default async function ArenaPage() {
  const { debates, error } = await loadArenaFeed();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              Public Arena
            </p>
            <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-parchment">
              Live Floor
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Active debates, ranked by ideological vector match. Escrow a bounty on
              the winner, or appeal a marginal AI score to a local jury.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/spectator"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-primary/60 bg-zinc-950 px-4 text-xs font-medium uppercase tracking-widest text-parchment transition-colors hover:border-primary hover:bg-zinc-900"
            >
              Donor Feed
            </Link>
            <CreateDebateButton />
          </div>
        </header>

        {error ? (
          <p className="mt-16 text-sm leading-6 text-muted-foreground">
            Could not load the arena. {error}
          </p>
        ) : debates.length === 0 ? (
          <Card className="mt-12">
            <CardHeader>
              <CardTitle>No live debates</CardTitle>
              <CardDescription>
                Post a policy prompt and wait for a vector-matched challenger.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <section className="mt-10 flex flex-col gap-6">
            {debates.map((debate) => (
              <DebateCard key={debate.id} debate={debate} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
