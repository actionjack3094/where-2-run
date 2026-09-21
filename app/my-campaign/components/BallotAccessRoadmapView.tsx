"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRoadmapTimers, type RoadmapTimers } from "@/app/actions/roadmap";
import { captureEscrow } from "@/app/actions/stripe/capture-escrow";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { districtLevel, formatElectability, formatMatchPct } from "@/lib/electability";
import { formatUsd } from "@/lib/pledges";
import { cn } from "@/lib/utils";

type LoadStage = "loading" | "ready" | "error";

function formatDays(value: number | null) {
  if (value === null) return "—";
  return String(Math.max(0, value));
}

function deadlineCaption(value: number | null) {
  if (value === null) return "Deadline unpublished";
  if (value < 0) return "Deadline passed";
  if (value === 0) return "Due today";
  return value === 1 ? "1 day on the clock" : `${value} days on the clock`;
}

function CountdownMetric({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  const passed = value !== null && value < 0;

  return (
    <div className="rounded-xl border border-gold/40 bg-zinc-950 px-5 py-5">
      <p
        className={cn(
          "font-display text-5xl font-bold tabular-nums tracking-tight text-parchment sm:text-6xl",
          passed && "text-zinc-500",
        )}
      >
        {formatDays(value)}
      </p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
        {label}
      </p>
      <p className="mt-1 text-sm text-zinc-500">{deadlineCaption(value)}</p>
    </div>
  );
}

function RoadmapDashboard({ timers }: { timers: RoadmapTimers }) {
  const goal = Math.max(0, timers.escrowGoal);
  const pledged = Math.max(0, timers.escrowPledged);
  const pct = goal > 0 ? Math.min(100, Math.round((pledged / goal) * 100)) : 0;
  const level = districtLevel(timers.districtLevel);
  const levelLabel =
    level === "local" ? "Local" : level === "state" ? "State" : level === "federal" ? "Federal" : "Seat";

  return (
    <Card className="bg-zinc-900">
      <CardHeader className="border-b border-gold/30">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
          Top matched race
        </p>
        <CardTitle className="font-display text-xl text-parchment">
          <Link
            href={`/district/${timers.electionId}`}
            className="transition-colors hover:text-gold"
          >
            {timers.office}
          </Link>
        </CardTitle>
        <CardDescription>
          {timers.state} · {levelLabel}
          {timers.raceName !== timers.office ? ` · ${timers.raceName}` : ""}
        </CardDescription>
        {timers.matchPercent !== null || timers.electability !== null ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {timers.matchPercent !== null ? (
              <span className="rounded-full border border-gold/40 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                Match {formatMatchPct(timers.matchPercent)}
              </span>
            ) : null}
            {timers.electability !== null ? (
              <span className="rounded-full bg-gold-strong px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-950">
                Electability {formatElectability(timers.electability)}
              </span>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="pt-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CountdownMetric
            value={timers.residencyDaysRemaining}
            label="Days Until Residency Required"
          />
          <CountdownMetric
            value={timers.filingDaysRemaining}
            label="Days Until Official Filing"
          />
        </div>

        <div className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                Tokenized escrow
              </p>
              <p className="mt-2 font-display text-lg font-semibold tracking-tight text-parchment">
                {formatUsd(pledged)} of {goal > 0 ? formatUsd(goal) : "an unpublished goal"}
              </p>
            </div>
            <p className="text-sm font-semibold tabular-nums text-parchment">{pct}%</p>
          </div>
          <div
            className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal || 100}
            aria-valuenow={goal > 0 ? Math.min(pledged, goal) : pledged}
            aria-label="Tokenized escrow pledges versus goal"
          >
            <div
              className="h-full rounded-full bg-gold-strong transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {goal > 0
              ? pledged >= goal
                ? "Escrow goal met. Grassroots backing is on the ledger."
                : `${formatUsd(Math.max(0, goal - pledged))} remaining to clear this race's escrow target.`
              : "File a seat with an escrow goal to track tokenized pledges here."}
          </p>
        </div>

        <FileAndCaptureEscrow candidateId={timers.userId} />
      </CardContent>
    </Card>
  );
}

function FileAndCaptureEscrow({ candidateId }: { candidateId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleCapture() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      await ensureArenaUser();
      const { data } = await supabase.auth.getSession();
      const outcome = await captureEscrow(
        candidateId,
        data.session?.access_token ?? null,
      );
      setResult(
        outcome.attempted === 0
          ? "No pending vaulted pledges to capture."
          : `Captured ${outcome.captured} of ${outcome.attempted} pledges${
              outcome.failed ? ` · ${outcome.failed} declined` : ""
            }.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not capture escrow pledges.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-gold/30 pt-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
        Official filing
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        After papers are filed, capture vaulted cards off-session.
      </p>
      <Button
        type="button"
        variant="gold"
        className="mt-4"
        disabled={busy}
        onClick={() => void handleCapture()}
      >
        {busy ? "Capturing escrow…" : "I've filed — capture escrow"}
      </Button>
      {result ? <p className="mt-3 text-sm text-parchment">{result}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

function EmptyRoadmap({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <Card className="bg-zinc-900">
      <CardHeader>
        <CardTitle className="font-display text-lg text-parchment">{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function BallotAccessRoadmapView({
  initial,
  resolvedUser = false,
}: {
  initial?: RoadmapTimers | null;
  resolvedUser?: boolean;
}) {
  const [timers, setTimers] = useState<RoadmapTimers | null>(initial ?? null);
  const [stage, setStage] = useState<LoadStage>(
    resolvedUser ? "ready" : "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resolvedUser) return;

    let cancelled = false;
    (async () => {
      try {
        const user = await ensureArenaUser();
        const next = await getRoadmapTimers(user.id);
        if (cancelled) return;
        setTimers(next);
        setStage("ready");
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load ballot-access timers.",
        );
        setStage("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedUser]);

  if (stage === "loading") {
    return (
      <EmptyRoadmap
        title="Scoring your top race"
        body="Pulling residency and filing deadlines for the seat you match best."
      />
    );
  }

  if (stage === "error") {
    return (
      <EmptyRoadmap
        title="Roadmap unavailable"
        body={error ?? "Could not load ballot-access timers."}
      />
    );
  }

  if (!timers) {
    return (
      <EmptyRoadmap
        title="No matched race on file"
        body="Complete the ideology quiz and file a district so residency and filing clocks can start."
      />
    );
  }

  return <RoadmapDashboard timers={timers} />;
}
