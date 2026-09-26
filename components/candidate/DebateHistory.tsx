import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type MatchOutcome = "won" | "lost" | "tied";

export type ProfileMatch = {
  id: string;
  question: string;
  concludedAt: string;
  outcome: MatchOutcome;
};

const OUTCOME_CLASS = {
  won: "border-gold bg-gold/15 text-gold",
  lost: "border-red-400/50 bg-red-400/10 text-red-300",
  tied: "border-zinc-600 bg-zinc-800 text-zinc-300",
} as const;

const OUTCOME_LABEL = {
  won: "Won",
  lost: "Lost",
  tied: "Tied",
} as const;

function formatConcludedDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function DebateHistory({ matches }: { matches: ProfileMatch[] }) {
  return (
    <section aria-labelledby="debate-history-heading">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
        Arena archive
      </p>
      <h2
        id="debate-history-heading"
        className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
      >
        Match history
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Completed debates, with the election question and the final result.
      </p>

      {matches.length === 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>No completed matches yet</CardTitle>
            <CardDescription>
              Finished debates land here with a win, loss, or tie.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {matches.map((match) => (
            <li key={match.id}>
              <Link href={`/debates/${match.id}`} className="block">
                <article className="rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)] transition-colors hover:border-gold">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="min-w-0 font-display text-lg font-semibold leading-snug tracking-tight text-parchment">
                      {match.question}
                    </h3>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest",
                        OUTCOME_CLASS[match.outcome],
                      )}
                    >
                      {OUTCOME_LABEL[match.outcome]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    Concluded{" "}
                    <time dateTime={match.concludedAt}>
                      {formatConcludedDate(match.concludedAt)}
                    </time>
                  </p>
                </article>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
