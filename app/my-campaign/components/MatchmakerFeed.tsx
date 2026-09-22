"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { matchCandidateDistricts } from "@/app/actions/match-districts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { cosineDistanceToMatchPercent } from "@/lib/ideology/stance";
import { toNumber } from "@/lib/electability";
import { cn } from "@/lib/utils";
import type { MatchedDistrictRow } from "@/types/database.types";

type FeedStage = "loading" | "ready" | "error";

const LANE_LABELS = ["Closest median", "Second seat", "Third seat"] as const;

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function matchPercent(row: MatchedDistrictRow) {
  const similarity = toNumber(row.similarity);
  if (similarity > 0) {
    return Math.round(Math.max(0, Math.min(1, similarity)) * 100);
  }
  return cosineDistanceToMatchPercent(toNumber(row.cosine_distance));
}

export function MatchmakerFeed() {
  const [stage, setStage] = useState<FeedStage>("loading");
  const [hasVector, setHasVector] = useState(false);
  const [matches, setMatches] = useState<MatchedDistrictRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setStage("loading");
    try {
      await ensureArenaUser();
      const token = await accessToken();
      const result = await matchCandidateDistricts(token);
      setHasVector(result.hasVector);
      setMatches(result.matches.slice(0, 3));
      setStage("ready");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not match districts to this ideology vector.",
      );
      setStage("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-labelledby="matchmaker-feed-heading" className="mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Geographic matchmaker
          </p>
          <h2
            id="matchmaker-feed-heading"
            className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
          >
            Closest median voters
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Top three districts whose median ideology vector sits nearest this
            campaign&apos;s coordinate.
          </p>
        </header>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={stage === "loading"}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-gold/60 bg-zinc-950 px-4 font-display text-xs font-semibold uppercase tracking-[0.18em] text-parchment transition-colors hover:border-gold hover:bg-zinc-900 disabled:pointer-events-none disabled:opacity-50"
        >
          {stage === "loading" ? "Matching…" : "Run matchmaker"}
        </button>
      </div>

      {stage === "loading" ? (
        <p className="mt-8 text-sm text-zinc-500">
          Scoring seats against your ideology vector…
        </p>
      ) : null}

      {stage === "error" ? (
        <div className="mt-8 space-y-3">
          <p className="text-sm text-zinc-400">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-[11px] font-medium uppercase tracking-widest text-gold underline-offset-4 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {stage === "ready" && !hasVector ? (
        <Card className="mt-8 bg-zinc-900">
          <CardHeader>
            <CardTitle>No ideology vector on file</CardTitle>
            <CardDescription>
              Finish candidate onboarding so the matchmaker can score districts
              against a 10-axis coordinate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/onboarding"
              className="inline-flex h-11 items-center justify-center rounded-md bg-gold-strong px-4 font-display text-xs font-semibold uppercase tracking-[0.18em] text-zinc-950 transition-colors hover:bg-gold"
            >
              Open onboarding
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {stage === "ready" && hasVector && matches.length === 0 ? (
        <p className="mt-8 text-sm leading-6 text-zinc-400">
          No geographic districts are close enough to this vector yet.
        </p>
      ) : null}

      {stage === "ready" && hasVector && matches.length > 0 ? (
        <ol className="mt-8 grid gap-3 lg:grid-cols-3">
          {matches.map((row, index) => {
            const percent = matchPercent(row);
            return (
              <li key={row.id}>
                <Link href={`/district/${row.id}`} className="block h-full">
                  <article
                    className={cn(
                      "flex h-full flex-col rounded-xl border bg-zinc-900 p-5 transition-colors hover:border-gold",
                      index === 0 ? "border-gold/70" : "border-gold/40",
                    )}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                      {LANE_LABELS[index] ?? `Seat ${index + 1}`}
                    </p>
                    <h3 className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight text-parchment">
                      {row.name}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      {[row.level, row.state, row.historical_lean]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-6 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                          Median alignment
                        </p>
                        <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-gold">
                          {percent}%
                        </p>
                      </div>
                      {row.pvi_score != null ? (
                        <p className="text-xs tabular-nums text-zinc-500">
                          PVI {toNumber(row.pvi_score) > 0 ? "+" : ""}
                          {toNumber(row.pvi_score)}
                        </p>
                      ) : null}
                    </div>
                  </article>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
