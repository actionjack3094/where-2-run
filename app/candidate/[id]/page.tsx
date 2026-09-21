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
import { CampaignStore } from "@/components/merch/CampaignStore";
import { usePledge } from "@/components/pledges/PledgeHost";
import { pickDebateWinnerId } from "@/lib/arena/winner";
import {
  candidateById,
  formatWinPercentage,
  isUuid,
  shareFor,
  unwrapCandidate,
} from "@/lib/arena/display";
import { supabase } from "@/lib/db/supabase";
import { cosineSimilarity, normalizeVector, parseVector, similarityToPercent } from "@/lib/ideology/vector";
import { formatRelativeTime, formatUsd, GRASSROOTS_THRESHOLD, parseAmount } from "@/lib/pledges";
import { cn } from "@/lib/utils";
import type {
  CandidateStats,
  DebateCandidate,
  DebateWithCandidates,
  District,
  Pledge,
  Vote,
} from "@/types/database.types";

type ArchivedMatch = DebateWithCandidates & {
  voteCount: number;
  aVotes: number;
  bVotes: number;
  aShare: number;
  bShare: number;
  winnerId: string | null;
};

async function resolveWinnerId(
  debate: DebateWithCandidates,
  votes: Pick<Vote, "candidate_id">[],
) {
  const { data, error } = await supabase.rpc("calculate_debate_winner", {
    debate_uuid: debate.id,
  });
  if (!error) return data ?? null;
  return pickDebateWinnerId(debate, votes);
}

export default function CandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <CandidateProfile key={id} candidateId={id} />;
}

function CandidateProfile({ candidateId }: { candidateId: string }) {
  const { openPledge } = usePledge();
  const [stats, setStats] = useState<CandidateStats | null>(null);
  const [district, setDistrict] = useState<District | null>(null);
  const [matches, setMatches] = useState<ArchivedMatch[]>([]);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [raised, setRaised] = useState(0);
  const [matchPercent, setMatchPercent] = useState<number | null>(null);
  const [stage, setStage] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  async function loadProfile() {
    setError(null);

    if (!isUuid(candidateId)) {
      setStats(null);
      setStage("missing");
      return;
    }

    const { data: statsRow, error: statsError } = await supabase
      .from("candidate_stats")
      .select("*")
      .eq("id", candidateId)
      .maybeSingle();

    if (statsError) {
      setError(statsError.message);
      setStage("error");
      return;
    }

    if (!statsRow) {
      setStats(null);
      setStage("missing");
      return;
    }

    const profile = statsRow as CandidateStats;
    setStats(profile);
    setRaised(parseAmount(profile.total_pledged));

    let matchedDistrict: District | null = null;
    if (profile.target_district_id) {
      const { data: districtRow, error: districtError } = await supabase
        .from("districts")
        .select("*")
        .eq("id", profile.target_district_id)
        .maybeSingle();
      if (districtError) {
        setError(districtError.message);
        setStage("error");
        return;
      }
      matchedDistrict = (districtRow as District | null) ?? null;
    }
    setDistrict(matchedDistrict);

    const hasVector = profile.ideology_vector != null && String(profile.ideology_vector).length > 0;
    if (hasVector && matchedDistrict) {
      const userVector = normalizeVector(parseVector(profile.ideology_vector));
      const median = normalizeVector(parseVector(matchedDistrict.median_ideology_vector));
      setMatchPercent(similarityToPercent(cosineSimilarity(userVector, median)));
    } else {
      setMatchPercent(null);
    }

    const { data: debateRows, error: debateError } = await supabase
      .from("debates")
      .select(
        `
        *,
        candidate_a:users!debates_candidate_a_id_fkey ( id, username ),
        candidate_b:users!debates_candidate_b_id_fkey ( id, username )
      `,
      )
      .eq("status", "completed")
      .or(`candidate_a_id.eq.${candidateId},candidate_b_id.eq.${candidateId}`)
      .order("expires_at", { ascending: false });

    if (debateError) {
      setError(debateError.message);
      setStage("error");
      return;
    }

    const archived = (debateRows ?? []) as DebateWithCandidates[];
    const debateIds = archived.map((debate) => debate.id);
    const voteQuery = debateIds.length
      ? await supabase
          .from("votes")
          .select("id, debate_id, candidate_id")
          .in("debate_id", debateIds)
      : { data: [] as Pick<Vote, "id" | "debate_id" | "candidate_id">[], error: null };

    if (voteQuery.error) {
      setError(voteQuery.error.message);
      setStage("error");
      return;
    }

    const votesByDebate = new Map<string, Pick<Vote, "id" | "debate_id" | "candidate_id">[]>();
    for (const vote of voteQuery.data ?? []) {
      const list = votesByDebate.get(vote.debate_id) ?? [];
      list.push(vote);
      votesByDebate.set(vote.debate_id, list);
    }

    const ranked = archived.map((debate) => {
      const rows = votesByDebate.get(debate.id) ?? [];
      const aVotes = rows.filter((vote) => vote.candidate_id === debate.candidate_a_id).length;
      const bVotes = rows.filter((vote) => vote.candidate_id === debate.candidate_b_id).length;
      const voteCount = rows.length;
      const aShare = shareFor(aVotes, voteCount);
      return {
        ...debate,
        voteCount,
        aVotes,
        bVotes,
        aShare,
        bShare: voteCount === 0 ? 0 : 100 - aShare,
        winnerId: null as string | null,
      };
    });

    const withWinners = await Promise.all(
      ranked.map(async (debate) => ({
        ...debate,
        winnerId: await resolveWinnerId(debate, votesByDebate.get(debate.id) ?? []),
      })),
    );

    const { data: pledgeRows, error: pledgeError } = await supabase
      .from("pledges")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (pledgeError) {
      setError(pledgeError.message);
      setStage("error");
      return;
    }

    setPledges((pledgeRows ?? []) as Pledge[]);
    setMatches(withWinners);
    setStage("ready");
  }

  function applyOptimisticPledge(pledge: Pledge) {
    setPledges((current) => [pledge, ...current.filter((entry) => entry.id !== pledge.id)]);
    setRaised((current) => current + parseAmount(pledge.amount));
  }

  function commitPledge(tempId: string, pledge: Pledge) {
    setPledges((current) => current.map((entry) => (entry.id === tempId ? pledge : entry)));
  }

  function rollbackPledge(tempId: string) {
    setPledges((current) => {
      const removed = current.find((entry) => entry.id === tempId);
      if (removed) {
        setRaised((value) => Math.max(0, value - parseAmount(removed.amount)));
      }
      return current.filter((entry) => entry.id !== tempId);
    });
  }

  function handleBackCandidate() {
    if (!stats) return;
    openPledge({
      candidateId: stats.id,
      candidateName: stats.username,
      onOptimistic: applyOptimisticPledge,
      onCommitted: commitPledge,
      onFailed: rollbackPledge,
    });
  }

  useEffect(() => {
    void loadProfile();
  }, [candidateId]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
            Candidate
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {stats?.username ?? (stage === "loading" ? "Loading…" : "Profile")}
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Lifetime record, grassroots pledges, and archived floor results.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stage === "ready" && stats && (
            <Button type="button" className="w-fit" onClick={handleBackCandidate}>
              Donate $50
            </Button>
          )}
          <Button asChild variant="outline" className="w-fit">
            <Link href="/district">Leaderboards</Link>
          </Button>
        </div>
      </div>

      {stage === "loading" && (
        <p className="mt-16 text-sm text-zinc-500">Pulling the filing…</p>
      )}

      {stage === "error" && (
        <section className="mt-16 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {error ?? "Could not load this candidate."}
          </p>
          <Button type="button" onClick={() => void loadProfile()}>
            Try again
          </Button>
        </section>
      )}

      {stage === "missing" && (
        <Card className="mt-12">
          <CardHeader>
            <CardTitle>Candidate not found</CardTitle>
            <CardDescription>
              This id is not on a ticket yet. Open a leaderboard and pick a name from the floor.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {stage === "ready" && stats && (
        <>
          <section className="mt-10">
            {district ? (
              <Link href={`/district/${district.id}`} className="block">
                <Card className="transition-colors hover:border-zinc-400 dark:hover:border-zinc-500">
                  <CardHeader>
                    <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                      Ideological vector match
                    </p>
                    <CardTitle className="text-lg">{district.name}</CardTitle>
                    <CardDescription>
                      {district.historical_lean ?? "Lean unpublished"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between">
                    <p className="text-xs uppercase tracking-widest text-zinc-400">
                      {district.level}
                    </p>
                    {matchPercent != null ? (
                      <p className="text-2xl font-semibold tabular-nums tracking-tight">
                        {matchPercent}%
                      </p>
                    ) : (
                      <p className="text-xs uppercase tracking-widest text-zinc-400">
                        Vector unpublished
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ) : (
              <Card>
                <CardHeader>
                  <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                    Ideological vector match
                  </p>
                  <CardTitle>No district on file</CardTitle>
                  <CardDescription>
                    This candidate has not confirmed a place to run.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </section>

          <section className="mt-6 grid grid-cols-2 gap-3">
            <StatCard label="Wins" value={stats.debates_won} />
            <StatCard label="Total Votes" value={stats.total_votes} />
          </section>
          <p className="mt-3 text-xs text-zinc-400">
            Win rate {formatWinPercentage(stats.win_percentage)} across {stats.debates_played}{" "}
            {stats.debates_played === 1 ? "completed match" : "completed matches"}.
          </p>

          <FundingBar raised={raised} />

          <CampaignStore candidateId={stats.id} />

          <section className="mt-16">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              Campaign
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Recent Backers & Endorsements
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Grassroots pledges and notes from the floor, newest first.
            </p>

            {pledges.length === 0 ? (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>No backers yet</CardTitle>
                  <CardDescription>
                    Be the first to put this campaign on the board. Pledges here are mock
                    checkout confirmations.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="mt-6 flex flex-col gap-3">
                {pledges.map((pledge) => (
                  <BackerCard key={pledge.id} pledge={pledge} />
                ))}
              </div>
            )}
          </section>

          <section className="mt-16">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              Archive
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Completed Matches</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Closed debates this candidate stood in, with the final winner from the ballot count.
            </p>

            {matches.length === 0 ? (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>No archived matches yet</CardTitle>
                  <CardDescription>
                    When an active debate expires, the hourly job closes it and the result lands here.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="mt-6 flex flex-col gap-3">
                {matches.map((debate) => (
                  <CompletedCard key={debate.id} debate={debate} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">{label}</p>
        <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      </CardHeader>
    </Card>
  );
}

function FundingBar({ raised }: { raised: number }) {
  const rawPercent = (raised / GRASSROOTS_THRESHOLD) * 100;
  const percentLabel =
    raised > 0 && rawPercent < 1 ? rawPercent.toFixed(1) : `${Math.round(rawPercent)}`;
  const remaining = Math.max(0, GRASSROOTS_THRESHOLD - raised);
  const cleared = raised >= GRASSROOTS_THRESHOLD;
  const barWidth = cleared ? 100 : raised > 0 ? Math.max(rawPercent, 1.5) : 0;

  return (
    <section className="mt-6">
      <Card>
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Grassroots threshold
          </p>
          <CardTitle>{formatUsd(raised)} raised</CardTitle>
          <CardDescription>
            {cleared
              ? "This campaign has cleared the $5,000 grassroots mark."
              : `${formatUsd(remaining)} to go toward ${formatUsd(GRASSROOTS_THRESHOLD)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={GRASSROOTS_THRESHOLD}
            aria-valuenow={Math.min(raised, GRASSROOTS_THRESHOLD)}
            aria-label="Campaign funding progress"
          >
            <div
              className="h-full bg-zinc-950 transition-all duration-500 dark:bg-zinc-50"
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-zinc-400">
            <span>{percentLabel}%</span>
            <span>{formatUsd(GRASSROOTS_THRESHOLD)}</span>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function BackerCard({ pledge }: { pledge: Pledge }) {
  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle className="text-base">{pledge.donor_name}</CardTitle>
          <p className="text-sm font-semibold tabular-nums">{formatUsd(pledge.amount)}</p>
        </div>
        <CardDescription>{formatRelativeTime(pledge.created_at)}</CardDescription>
      </CardHeader>
      {pledge.message ? (
        <CardContent>
          <p className="text-sm leading-6">{pledge.message}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function CompletedCard({ debate }: { debate: ArchivedMatch }) {
  const candidateA = unwrapCandidate(debate.candidate_a);
  const candidateB = unwrapCandidate(debate.candidate_b);
  const winner = candidateById(debate, debate.winnerId);
  const aWidth = debate.voteCount === 0 ? 50 : debate.aShare;
  const bWidth = debate.voteCount === 0 ? 50 : debate.bShare;

  const resultLabel = winner
    ? `Winner: ${winner.username}`
    : debate.voteCount === 0
      ? "No ballots were cast"
      : "Draw — no winner declared";

  return (
    <Link href={`/arena/${debate.id}`} className="block">
      <Card className="transition-colors hover:border-zinc-400 dark:hover:border-zinc-500">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Completed</Badge>
            {winner ? (
              <Badge className="border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50">
                Winner declared
              </Badge>
            ) : (
              <Badge>{debate.voteCount === 0 ? "No contest" : "Draw"}</Badge>
            )}
          </div>
          <CardTitle className="text-lg leading-snug">{debate.topic}</CardTitle>
          <CardDescription>
            {candidateA?.username ?? "Open seat"} vs {candidateB?.username ?? "Open seat"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">{resultLabel}</p>
          <VoteBar
            debate={debate}
            candidateA={candidateA}
            candidateB={candidateB}
            aWidth={aWidth}
            bWidth={bWidth}
          />
        </CardContent>
      </Card>
    </Link>
  );
}

function VoteBar({
  debate,
  candidateA,
  candidateB,
  aWidth,
  bWidth,
}: {
  debate: ArchivedMatch;
  candidateA: DebateCandidate | null;
  candidateB: DebateCandidate | null;
  aWidth: number;
  bWidth: number;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium tabular-nums">
          {debate.voteCount} {debate.voteCount === 1 ? "vote" : "votes"}
        </p>
        <p className="text-xs tabular-nums text-zinc-400">
          {debate.aShare}% · {debate.bShare}%
        </p>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
        <div
          className="h-full bg-zinc-950 transition-all duration-500 dark:bg-zinc-50"
          style={{ width: `${aWidth}%` }}
        />
        <div
          className="h-full bg-zinc-300 transition-all duration-500 dark:bg-zinc-700"
          style={{ width: `${bWidth}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{candidateA?.username ?? "Candidate A"}</span>
        <span>{candidateB?.username ?? "Candidate B"}</span>
      </div>
    </>
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
