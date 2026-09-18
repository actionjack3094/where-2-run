"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { CandidateStats, District } from "@/types/database.types";

type DistrictBoard = District & {
  candidateCount: number;
  topWins: number;
};

export default function LeaderboardsIndexPage() {
  const [districts, setDistricts] = useState<DistrictBoard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stage, setStage] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  async function loadDistricts() {
    setError(null);

    const [{ data: districtRows, error: districtError }, { data: statsRows, error: statsError }] =
      await Promise.all([
        supabase.from("districts").select("*").order("name"),
        supabase.from("candidate_stats").select("target_district_id, debates_won"),
      ]);

    if (districtError) {
      setError(districtError.message);
      setStage("error");
      return;
    }

    if (statsError) {
      setError(statsError.message);
      setStage("error");
      return;
    }

    const counts = new Map<string, { candidateCount: number; topWins: number }>();
    for (const row of (statsRows ?? []) as Pick<
      CandidateStats,
      "target_district_id" | "debates_won"
    >[]) {
      if (!row.target_district_id) continue;
      const current = counts.get(row.target_district_id) ?? { candidateCount: 0, topWins: 0 };
      current.candidateCount += 1;
      current.topWins = Math.max(current.topWins, row.debates_won);
      counts.set(row.target_district_id, current);
    }

    const boards = ((districtRows ?? []) as District[]).map((district) => {
      const tally = counts.get(district.id);
      return {
        ...district,
        candidateCount: tally?.candidateCount ?? 0,
        topWins: tally?.topWins ?? 0,
      };
    });

    setDistricts(boards);
    setStage("ready");
  }

  useEffect(() => {
    setSelectedId(window.sessionStorage.getItem(STORAGE_KEYS.districtId));
    void loadDistricts();
  }, []);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
            Leaderboards
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Districts</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Open a seat and see who is winning debates on that floor.
          </p>
        </div>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/spectator">Donor Feed</Link>
        </Button>
      </div>

      {stage === "loading" && (
        <p className="mt-16 text-sm text-zinc-500">Mapping the seats…</p>
      )}

      {stage === "error" && (
        <section className="mt-16 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {error ?? "Could not load district leaderboards."}
          </p>
          <Button type="button" onClick={() => void loadDistricts()}>
            Try again
          </Button>
        </section>
      )}

      {stage === "ready" && districts.length === 0 && (
        <Card className="mt-12">
          <CardHeader>
            <CardTitle>No districts yet</CardTitle>
            <CardDescription>
              Seed a district map, then candidates can file and start climbing the board.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {stage === "ready" && districts.length > 0 && (
        <section className="mt-10 flex flex-col gap-3">
          {districts.map((district) => {
            const selected = selectedId === district.id;
            return (
              <Link key={district.id} href={`/district/${district.id}`} className="block">
                <Card
                  className={cn(
                    "transition-colors hover:border-zinc-400 dark:hover:border-zinc-500",
                    selected &&
                      "border-zinc-950 ring-1 ring-zinc-950 dark:border-zinc-50 dark:ring-zinc-50",
                  )}
                >
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      {selected ? (
                        <span className="rounded-full border border-zinc-950 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-950 dark:border-zinc-50 dark:text-zinc-50">
                          Your district
                        </span>
                      ) : null}
                      <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                        {district.level}
                      </span>
                    </div>
                    <CardTitle className="text-lg">{district.name}</CardTitle>
                    <CardDescription>
                      {district.historical_lean ?? "Lean unpublished"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between">
                    <p className="text-xs uppercase tracking-widest text-zinc-400">
                      {district.candidateCount}{" "}
                      {district.candidateCount === 1 ? "candidate" : "candidates"}
                    </p>
                    <div className="text-right">
                      <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                        Top wins
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                        {district.topWins}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </section>
      )}
    </main>
  );
}
