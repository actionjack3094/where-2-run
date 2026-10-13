import Link from "next/link";
import { Lock } from "lucide-react";
import type { CampaignUnlocks, UnlockStage } from "@/lib/campaign/unlocks";
import { cn } from "@/lib/utils";

export function MilestoneUnlocks({
  unlocks,
  primaryHref,
}: {
  unlocks: CampaignUnlocks;
  primaryHref: string | null;
}) {
  return (
    <section aria-labelledby="campaign-milestones-heading" className="mt-8">
      <div className="rounded-2xl border border-amber-500/40 bg-white px-5 py-6 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-800">Campaign Roadmap</p>
        <h2
          id="campaign-milestones-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-stone-900"
        >
          Campaign Milestones & Unlocks
        </h2>
        <p className="mt-4 text-base font-medium leading-7 text-stone-900">{unlocks.header}</p>
        {unlocks.officeLabel ? (
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Filing fee threshold{" "}
            <span className="font-medium tabular-nums text-stone-900">
              {unlocks.filingFeeLabel ?? "not on file"}
            </span>
            {primaryHref ? (
              <>
                {" "}
                ·{" "}
                <Link href={primaryHref} className="text-amber-800">
                  View the primary
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Choose a race to set the office name and the statutory filing fee.{" "}
            <Link href="/elections/matched" className="text-amber-800">
              Explore running for an office
            </Link>
            .
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <RankChip rank={unlocks.rank} />
          {unlocks.filed ? <BallotBadge /> : null}
        </div>
        <ol className="mt-6 grid gap-4">
          {unlocks.stages.map((stage) => (
            <StageCard key={stage.id} stage={stage} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function RankChip({ rank }: { rank: CampaignUnlocks["rank"] }) {
  const unlocked = rank === "CONTENDER";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest",
        unlocked
          ? "bg-gold-strong text-stone-900"
          : "border border-stone-300 bg-stone-100 text-stone-600",
      )}
    >
      {rank}
    </span>
  );
}

function BallotBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-gold-strong px-2.5 py-1 text-[11px] font-semibold tracking-widest text-stone-900 ring-2 ring-gold">
      ON THE BALLOT
    </span>
  );
}

function StageCard({ stage }: { stage: UnlockStage }) {
  const width =
    stage.progress && stage.progress.goal > 0
      ? Math.min(100, Math.round((Math.min(stage.progress.current, stage.progress.goal) / stage.progress.goal) * 100))
      : stage.locked
        ? 0
        : 100;

  return (
    <li
      className={cn(
        "rounded-xl border px-4 py-4 sm:px-5",
        stage.locked ? "border-stone-300 bg-stone-100" : "border-amber-500/40 bg-amber-50/40",
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
            stage.locked
              ? "border-stone-300 bg-white text-stone-500"
              : "border-gold bg-gold-strong text-stone-900",
          )}
          aria-hidden
        >
          {stage.locked ? <Lock className="h-4 w-4" /> : <span className="font-display text-sm">✓</span>}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-stone-500">
                Stage {stage.step} · {stage.lockName}
              </p>
              <h3 className="mt-1 font-display text-lg text-stone-900">{stage.title}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {stage.badge ? <BallotBadge /> : null}
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest",
                  stage.locked
                    ? "border border-stone-300 bg-white text-stone-600"
                    : "bg-gold-strong text-stone-900",
                )}
              >
                {stage.locked ? "Locked" : stage.statusLabel}
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            <span className="font-medium text-stone-900">Unlocks: </span>
            {stage.unlocks}
          </p>
          {stage.progress ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-widest text-stone-500">
                  {stage.progress.caption}
                </p>
                <p className="text-sm font-medium tabular-nums text-stone-900">{stage.progress.label}</p>
              </div>
              <div
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-white"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={stage.progress.goal}
                aria-valuenow={Math.min(stage.progress.current, stage.progress.goal)}
                aria-label={stage.progress.caption}
              >
                <div
                  className={cn("h-full rounded-full", stage.locked ? "bg-stone-400" : "bg-gold-strong")}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          ) : null}
          {stage.lockCopy ? (
            <p
              className="mt-3 flex items-start gap-2 text-sm font-medium leading-6 text-stone-800"
              title={stage.lockCopy}
            >
              <Lock className="mt-1 h-4 w-4 shrink-0" aria-hidden />
              <span>{stage.lockCopy}</span>
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
