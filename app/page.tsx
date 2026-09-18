import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { unwrapCandidate } from "@/lib/arena/display";
import { getExpiryState, TOTAL_ROUNDS } from "@/lib/arena/time";
import { getTrendingDebates, type TrendingDebatePreview } from "@/lib/arena/trending";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "WHERE 2 RUN",
  description:
    "Find the district that can elect you, then enter the arena. Spectators watch, vote, and back the winner.",
};

export default async function Home() {
  const debates = await getTrendingDebates(3);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col px-6 py-16 sm:py-20">
      <section className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
            Where 2 Run
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.1]">
            Find the district that can elect you. Watch the floor that decides it.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-zinc-500 dark:text-zinc-400">
            Candidates match a seat, then debate on the clock. Spectators rank the room with
            ballots and grassroots pledges.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-fit">
              <Link href="/onboarding">Take the quiz</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-fit">
              <Link href="/spectator">Watch live arenas</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <ValueCard
            eyebrow="Candidates"
            title="Run where you can win"
            body="Six questions. A 10-dimensional ideology vector. A safe primary and a toss-up general, scored against district medians."
            href="/onboarding"
            cta="Begin onboarding"
          />
          <ValueCard
            eyebrow="Spectators"
            title="Fund who earned the room"
            body="Open the donor feed, vote the live floor, and back a candidate after they prove they can hold a district."
            href="/spectator"
            cta="Open the donor feed"
          />
        </div>
      </section>

      <section className="mt-20 sm:mt-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              Live Arenas
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Trending on the floor
            </h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
              The three liveliest debates, ranked by spectator ballots.
            </p>
          </div>
          <Button asChild variant="outline" className="w-fit">
            <Link href="/arena">View all arenas</Link>
          </Button>
        </div>

        {debates.length === 0 ? (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>The floor is quiet</CardTitle>
              <CardDescription>
                No live debates are trending yet. Post a topic, or watch the donor feed once the
                first ballots land.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/arena">Enter the arena</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {debates.map((debate, index) => (
              <LiveArenaCard key={debate.id} debate={debate} rank={index + 1} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ValueCard({
  eyebrow,
  title,
  body,
  href,
  cta,
}: {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">{eyebrow}</p>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href={href}
          className="text-[11px] font-medium uppercase tracking-widest text-zinc-950 transition-colors hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
        >
          {cta} →
        </Link>
      </CardContent>
    </Card>
  );
}

function LiveArenaCard({
  debate,
  rank,
}: {
  debate: TrendingDebatePreview;
  rank: number;
}) {
  const candidateA = unwrapCandidate(debate.candidate_a);
  const candidateB = unwrapCandidate(debate.candidate_b);
  const expiry = getExpiryState(debate.expires_at);

  return (
    <Link href={`/arena/${debate.id}`} className="block h-full">
      <Card className="h-full transition-colors hover:border-zinc-400 dark:hover:border-zinc-500">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>#{rank}</Badge>
            <Badge>{statusLabel(debate.status)}</Badge>
            <Badge>
              Round {Math.min(debate.current_round, TOTAL_ROUNDS)} of {TOTAL_ROUNDS}
            </Badge>
          </div>
          <CardTitle className="text-lg leading-snug">{debate.topic}</CardTitle>
          <CardDescription>
            {candidateA?.username ?? "Open seat"} vs {candidateB?.username ?? "Open seat"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-end justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-zinc-400">
            {debate.voteCount} {debate.voteCount === 1 ? "vote" : "votes"}
          </p>
          <p
            className={cn(
              "text-[11px] font-medium uppercase tracking-widest text-zinc-400",
              expiry.tone === "soon" && "text-amber-700 dark:text-amber-400",
            )}
          >
            {expiry.label}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function statusLabel(status: string) {
  if (status === "matching") return "Matching";
  if (status === "voting") return "Voting";
  return "Active";
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      {children}
    </span>
  );
}
