import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatUsd } from "@/lib/pledges";
import type { WarRoomMetrics as Metrics } from "@/lib/war-room";

export function WarRoomMetrics({ metrics }: { metrics: Metrics }) {
  const eloCaption = metrics.eloLocked
    ? `Locked from ${metrics.lockedMatchCount} ${
        metrics.lockedMatchCount === 1 ? "verdict" : "verdicts"
      }`
    : metrics.evaluationCount > 0
      ? `${metrics.evaluationCount} ${
          metrics.evaluationCount === 1 ? "evaluation" : "evaluations"
        } on file`
      : "Provisional until an evaluation locks";

  return (
    <section aria-label="Campaign analytics" className="grid gap-3 sm:grid-cols-2">
      <Card className="bg-zinc-900">
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
            Vault
          </p>
          <CardTitle className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight text-gold sm:text-4xl">
            {formatUsd(metrics.escrowTotal)}
          </CardTitle>
          <CardDescription>Total Escrow Raised</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-zinc-400">
            {metrics.escrowCount === 0
              ? "No uncaptured SetupIntents in the vault yet."
              : `${metrics.escrowCount} ${
                  metrics.escrowCount === 1 ? "SetupIntent is" : "SetupIntents are"
                } vaulted and waiting on a filing.`}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900">
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
            Arena
          </p>
          <CardTitle className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight text-gold sm:text-4xl">
            {metrics.eloRating}
          </CardTitle>
          <CardDescription>ELO Rating</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-zinc-400">{eloCaption}</p>
        </CardContent>
      </Card>
    </section>
  );
}
