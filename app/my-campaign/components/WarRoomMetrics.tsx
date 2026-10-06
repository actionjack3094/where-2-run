import { CIVIC_STANDING_TIP, InfoTooltip, PLEDGED_ESCROW_TIP } from "@/components/InfoTooltip";
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
      <Card className="bg-white">
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-widest text-amber-800">
            Vault
          </p>
          <CardTitle className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight text-amber-800 sm:text-4xl">
            {formatUsd(metrics.escrowTotal)}
          </CardTitle>
          <CardDescription className="inline-flex items-center gap-1.5">
            Pledged Escrow
            <InfoTooltip label="Pledged Escrow" text={PLEDGED_ESCROW_TIP} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-stone-600">
            {metrics.escrowCount === 0
              ? "No uncaptured SetupIntents in the vault yet."
              : `${metrics.escrowCount} ${
                  metrics.escrowCount === 1 ? "SetupIntent is" : "SetupIntents are"
                } vaulted and waiting on a filing.`}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-widest text-amber-800">
            Debates
          </p>
          <CardTitle className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight text-amber-800 sm:text-4xl">
            {metrics.eloRating}
          </CardTitle>
          <CardDescription className="inline-flex items-center gap-1.5">
            Civic Standing
            <InfoTooltip label="Civic Standing" text={CIVIC_STANDING_TIP} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-stone-600">{eloCaption}</p>
        </CardContent>
      </Card>
    </section>
  );
}
