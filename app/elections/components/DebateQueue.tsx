import { CreateDebateButton } from "@/components/debates/CreateDebateButton";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatUsd } from "@/lib/pledges";
import type { ArenaFeedDebate } from "@/lib/arena/feed-types";
import type { ElectionEscrowPledge } from "@/lib/elections";
import { DebateCard } from "./DebateCard";

export function DebateQueue({
  debates,
  pledges,
  escrowTotal,
  electionId,
  electionSlug,
  officeName,
}: {
  debates: ArenaFeedDebate[];
  pledges: ElectionEscrowPledge[];
  escrowTotal: number;
  electionId: string;
  electionSlug: string;
  officeName: string;
}) {
  return (
    <section aria-labelledby="debate-queue-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
            Policy prompts
          </p>
          <h2
            id="debate-queue-heading"
            className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
          >
            Debate queue
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Floor prompts assigned to {officeName}. Escrow a bounty on a winner,
            or post the next question this district should answer.
          </p>
        </header>
        <CreateDebateButton
          electionId={electionId}
          electionSlug={electionSlug}
        />
      </div>

      {pledges.length > 0 ? (
        <p className="mt-4 text-sm text-zinc-400">
          {formatUsd(escrowTotal)} vaulted across {pledges.length}{" "}
          {pledges.length === 1 ? "pledge" : "pledges"} on this race.
        </p>
      ) : null}

      {debates.length === 0 ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>No prompts on this race yet</CardTitle>
            <CardDescription>
              Open a policy prompt for {officeName}. Vector-matched challengers
              take the other lectern.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {debates.map((debate) => (
            <DebateCard key={debate.id} debate={debate} />
          ))}
        </div>
      )}
    </section>
  );
}
