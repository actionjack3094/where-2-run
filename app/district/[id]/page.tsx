"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatWinPercentage, isUuid } from "@/lib/arena/display";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";
import type { CandidateStats, District } from "@/types/database.types";

export default function DistrictLeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <DistrictLeaderboard key={id} districtId={id} />;
}

function DistrictLeaderboard({ districtId }: { districtId: string }) {
  const [district, setDistrict] = useState<District | null>(null);
  const [candidates, setCandidates] = useState<CandidateStats[]>([]);
  const [stage, setStage] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  async function loadBoard() {
    setError(null);

    if (!isUuid(districtId)) {
      setDistrict(null);
      setStage("missing");
      return;
    }

    const [{ data: districtRow, error: districtError }, { data: rows, error: statsError }] =
      await Promise.all([
        supabase.from("districts").select("*").eq("id", districtId).maybeSingle(),
        supabase
          .from("candidate_stats")
          .select("*")
          .eq("target_district_id", districtId)
          .order("debates_won", { ascending: false })
          .order("total_votes", { ascending: false })
          .order("win_percentage", { ascending: false })
          .order("username", { ascending: true }),
      ]);

    if (districtError) {
      setError(districtError.message);
      setStage("error");
      return;
    }

    if (!districtRow) {
      setDistrict(null);
      setStage("missing");
      return;
    }

    if (statsError) {
      setError(statsError.message);
      setStage("error");
      return;
    }

    setDistrict(districtRow);
    setCandidates((rows ?? []) as CandidateStats[]);
    setStage("ready");
  }

  useEffect(() => {
    void loadBoard();
  }, [districtId]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
            Leaderboard
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {district?.name ?? (stage === "loading" ? "Loading…" : "District")}
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {district
              ? `Candidates in this district, ranked by debate wins.${
                  district.historical_lean ? ` ${district.historical_lean}.` : ""
                }`
              : "Ranked by lifetime debate wins."}
          </p>
        </div>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/district">All districts</Link>
        </Button>
      </div>

      {stage === "loading" && (
        <p className="mt-16 text-sm text-zinc-500">Tallying the field…</p>
      )}

      {stage === "error" && (
        <section className="mt-16 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {error ?? "Could not load this leaderboard."}
          </p>
          <Button type="button" onClick={() => void loadBoard()}>
            Try again
          </Button>
        </section>
      )}

      {stage === "missing" && (
        <Card className="mt-12">
          <CardHeader>
            <CardTitle>District not found</CardTitle>
            <CardDescription>
              That seat is not in the map. Pick a district from the leaderboards index.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {stage === "ready" && candidates.length === 0 && (
        <Card className="mt-12">
          <CardHeader>
            <CardTitle>No candidates yet</CardTitle>
            <CardDescription>
              Confirm this district in the funnel, then win debates to claim the board.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {stage === "ready" && candidates.length > 0 && (
        <section className="mt-10 flex flex-col gap-3">
          {candidates.map((candidate, index) => (
            <LeaderboardCard key={candidate.id} candidate={candidate} rank={index + 1} />
          ))}
        </section>
      )}
    </main>
  );
}

function LeaderboardCard({
  candidate,
  rank,
}: {
  candidate: CandidateStats;
  rank: number;
}) {
  return (
    <Link href={`/candidate/${candidate.id}`} className="block">
      <Card className="transition-colors hover:border-zinc-400 dark:hover:border-zinc-500">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>#{rank}</Badge>
            {candidate.is_verified ? (
              <Badge className="border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50">
                Verified
              </Badge>
            ) : null}
            {candidate.tier ? <Badge>{candidate.tier}</Badge> : null}
          </div>
          <CardTitle className="text-lg leading-snug">{candidate.username}</CardTitle>
          <CardDescription>
            {candidate.debates_won} {candidate.debates_won === 1 ? "win" : "wins"} ·{" "}
            {candidate.total_votes} {candidate.total_votes === 1 ? "vote" : "votes"} ·{" "}
            {formatWinPercentage(candidate.win_percentage)} win rate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium tabular-nums">
              {candidate.debates_won} {candidate.debates_won === 1 ? "win" : "wins"}
            </p>
            <p className="text-xs tabular-nums text-zinc-400">
              {candidate.total_votes} {candidate.total_votes === 1 ? "vote" : "votes"}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500 dark:border-zinc-800 dark:text-zinc-400",
        className,
      )}
    >
      {children}
    </span>
  );
}
