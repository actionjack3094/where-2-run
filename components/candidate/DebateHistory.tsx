import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/pledges";
import { cn } from "@/lib/utils";
import type { CandidateArenaMatch } from "@/lib/candidate-profile";

const BAND_CLASS = {
  pending: "border-zinc-700 text-zinc-400",
  thin: "border-red-400/50 text-red-300",
  marginal: "border-gold/60 text-gold",
  decisive: "border-gold text-gold",
} as const;

export function DebateHistory({ matches }: { matches: CandidateArenaMatch[] }) {
  return (
    <section aria-labelledby="debate-history-heading">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
        Arena archive
      </p>
      <h2
        id="debate-history-heading"
        className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
      >
        Debate history
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Past floor matches with the policy prompt and the AI judge&apos;s final
        confidence verdict.
      </p>

      {matches.length === 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>No arena matches yet</CardTitle>
            <CardDescription>
              Completed debates land here with the Primary Judge score and confidence
              band.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="mt-6 max-h-[36rem] space-y-3 overflow-y-auto pr-1">
          {matches.map((match) => (
            <li key={match.debateId}>
              <Link href={`/arena/${match.debateId}`} className="block">
                <article className="rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)] transition-colors hover:border-gold">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-gold/40 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-gold">
                      Policy prompt
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest",
                        BAND_CLASS[match.verdictBand],
                      )}
                    >
                      {match.verdictLabel}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight text-parchment">
                    {match.topic}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {match.opponentName
                      ? `vs ${match.opponentName}`
                      : "Open seat"}
                    {" · "}
                    {formatRelativeTime(match.occurredAt)}
                  </p>
                  <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <div>
                      <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                        AI confidence
                      </dt>
                      <dd className="mt-1 font-medium tabular-nums text-gold">
                        {match.confidenceScore == null
                          ? "—"
                          : match.confidenceScore.toFixed(2)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                        Rubric score
                      </dt>
                      <dd className="mt-1 font-medium tabular-nums text-parchment">
                        {match.primaryScore == null
                          ? "—"
                          : match.primaryScore.toFixed(1)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs leading-5 text-zinc-500">{match.verdictDetail}</p>
                </article>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
