import { Carrot } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatUsd, GRASSROOTS_THRESHOLD, parseAmount } from "@/lib/pledges";
import { cn } from "@/lib/utils";

export function EscrowTracker({
  total,
  count,
  candidateName,
}: {
  total: number;
  count: number;
  candidateName: string;
}) {
  const raised = parseAmount(total);
  const rawPercent = (raised / GRASSROOTS_THRESHOLD) * 100;
  const percentLabel =
    raised > 0 && rawPercent < 1 ? rawPercent.toFixed(1) : `${Math.round(rawPercent)}`;
  const remaining = Math.max(0, GRASSROOTS_THRESHOLD - raised);
  const cleared = raised >= GRASSROOTS_THRESHOLD;
  const barWidth = cleared ? 100 : raised > 0 ? Math.max(rawPercent, 2.5) : 0;

  return (
    <section aria-labelledby="escrow-heading">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
        War chest
      </p>
      <h2
        id="escrow-heading"
        className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
      >
        Escrow tracker
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Uncaptured Stripe SetupIntents sitting in {candidateName}'s vault. The
        carrot dangles until this campaign files — then the cards charge.
      </p>

      <Card className="mt-6 overflow-hidden">
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
              Dangling carrot
            </p>
            <CardTitle className="mt-2 font-display text-4xl font-semibold tabular-nums tracking-tight text-gold sm:text-5xl">
              {formatUsd(raised)}
            </CardTitle>
            <CardDescription className="mt-2 max-w-md">
              {count === 0
                ? "No vaulted SetupIntents yet. Pledge a card to hang the first carrot."
                : `${count} ${count === 1 ? "pledge is" : "pledges are"} vaulted and uncaptured. Nothing moves until ballot papers are filed.`}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-col items-center px-2 pt-1" aria-hidden>
            <Carrot className="h-8 w-8 animate-bounce text-gold" strokeWidth={1.75} />
            <span className="mt-1 h-8 w-px bg-gradient-to-b from-gold to-gold/10" />
            <span className="rounded-md border border-gold/50 bg-zinc-950 px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-gold">
              Vaulted
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="h-3 overflow-hidden rounded-full bg-zinc-950"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={GRASSROOTS_THRESHOLD}
            aria-valuenow={Math.min(raised, GRASSROOTS_THRESHOLD)}
            aria-label="Uncaptured escrow toward grassroots threshold"
          >
            <div
              className={cn(
                "h-full bg-gold transition-all duration-500",
                raised === 0 && "opacity-40",
              )}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-zinc-500">
            <span>{percentLabel}% of {formatUsd(GRASSROOTS_THRESHOLD)}</span>
            <span>
              {cleared
                ? "Threshold cleared — still uncaptured"
                : `${formatUsd(remaining)} still dangling`}
            </span>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
