"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { Button } from "@/components/ui/button";
import {
  discoveryBucket,
  type DiscoveryDebate,
  type DiscoveryFilter,
  type DiscoverySeat,
} from "@/lib/debates/discovery";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const FILTERS: { id: DiscoveryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live / Active" },
  { id: "concluded", label: "Concluded / Judged" },
  { id: "upcoming", label: "Upcoming / Open Seats" },
];

type Tally = { a: number; b: number };

type LiveDebate = {
  status: string;
  winnerId: string | null;
  judgeReasoning: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function voteChoice(row: Record<string, unknown>) {
  if (typeof row.selection === "string" && row.selection) return row.selection;
  if (typeof row.voted_for_user_id === "string") return row.voted_for_user_id;
  return null;
}

function winnerName(debate: DiscoveryDebate, winnerId: string | null) {
  if (winnerId && winnerId === debate.candidateA?.id) return debate.candidateA.username;
  if (winnerId && winnerId === debate.candidateB?.id) return debate.candidateB.username;
  return null;
}

export function DiscoveryFeed({ debates }: { debates: DiscoveryDebate[] }) {
  const [filter, setFilter] = useState<DiscoveryFilter>("all");
  const [live, setLive] = useState<Record<string, LiveDebate>>({});
  const [tallies, setTallies] = useState<Record<string, Tally>>(() =>
    Object.fromEntries(debates.map((debate) => [debate.id, { a: debate.votesA, b: debate.votesB }])),
  );

  const ids = useMemo(() => debates.map((debate) => debate.id).join(","), [debates]);

  useEffect(() => {
    if (debates.length === 0) return;
    const seats = new Map(
      debates.map((debate) => [
        debate.id,
        { a: debate.candidateA?.id ?? null, b: debate.candidateB?.id ?? null },
      ]),
    );
    const seen = new Set<string>();
    let active = true;

    function addVote(row: Record<string, unknown>) {
      const id = typeof row.id === "string" ? row.id : "";
      const debateId = typeof row.debate_id === "string" ? row.debate_id : "";
      if (!id || !debateId || seen.has(id) || !seats.has(debateId)) return;
      seen.add(id);
      const choice = voteChoice(row);
      const seat = seats.get(debateId);
      setTallies((current) => {
        const tally = current[debateId] ?? { a: 0, b: 0 };
        if (choice && choice === seat?.a) {
          return { ...current, [debateId]: { ...tally, a: tally.a + 1 } };
        }
        if (choice && choice === seat?.b) {
          return { ...current, [debateId]: { ...tally, b: tally.b + 1 } };
        }
        return current;
      });
    }

    function applyDebate(row: Record<string, unknown>) {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id || !seats.has(id)) return;
      const status = typeof row.status === "string" ? row.status : "";
      if (!status) return;
      setLive((current) => ({
        ...current,
        [id]: {
          status,
          winnerId: typeof row.winner_id === "string" ? row.winner_id : null,
          judgeReasoning:
            typeof row.judge_reasoning === "string" && row.judge_reasoning.trim()
              ? row.judge_reasoning.trim()
              : (current[id]?.judgeReasoning ?? null),
        },
      }));
    }

    async function loadExistingVotes() {
      const { data, error } = await supabase
        .from("debate_votes")
        .select("id, debate_id, voted_for_user_id, selection")
        .in("debate_id", debates.map((debate) => debate.id));
      if (!active || error || !data) return;
      const next: Record<string, Tally> = {};
      for (const debate of debates) next[debate.id] = { a: 0, b: 0 };
      seen.clear();
      for (const row of data) {
        const record = asRecord(row) ?? (row as Record<string, unknown>);
        const id = typeof record.id === "string" ? record.id : "";
        const debateId = typeof record.debate_id === "string" ? record.debate_id : "";
        if (!id || !debateId || !next[debateId]) continue;
        seen.add(id);
        const choice = voteChoice(record);
        const seat = seats.get(debateId);
        if (choice && choice === seat?.a) next[debateId].a += 1;
        else if (choice && choice === seat?.b) next[debateId].b += 1;
      }
      if (active) setTallies(next);
    }

    const channel = supabase
      .channel("discover-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "debate_votes" },
        (payload) => {
          const row = asRecord(payload.new);
          if (row) addVote(row);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "debates" },
        (payload) => {
          const row = asRecord(payload.new);
          if (row) applyDebate(row);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void loadExistingVotes();
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [ids, debates]);

  const visible = debates.filter((debate) => {
    if (filter === "all") return true;
    const status = live[debate.id]?.status ?? debate.status;
    return discoveryBucket({ ...debate, status }) === filter;
  });

  return (
    <div>
      <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Debate status">
        {FILTERS.map((item) => {
          const selected = filter === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={selected ? "gold" : "outline"}
              aria-pressed={selected}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-sm leading-6 text-zinc-400">
          No debates in this lane yet.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          {visible.map((debate) => (
            <DiscoveryCard
              key={debate.id}
              debate={debate}
              live={live[debate.id]}
              tally={tallies[debate.id] ?? { a: debate.votesA, b: debate.votesB }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DiscoveryCard({
  debate,
  live,
  tally,
}: {
  debate: DiscoveryDebate;
  live: LiveDebate | undefined;
  tally: Tally;
}) {
  const status = live?.status ?? debate.status;
  const winnerId = live?.winnerId ?? debate.winnerId;
  const judgeReasoning = live?.judgeReasoning ?? debate.judgeReasoning;
  const bucket = discoveryBucket({ ...debate, status });
  const winner = winnerName(debate, winnerId);
  const districtHref = debate.electionSlug
    ? `/elections/${debate.electionSlug}/profile`
    : null;

  return (
    <article className="rounded-xl border border-primary/30 bg-card px-5 py-5 text-card-foreground">
      <div className="flex flex-wrap items-center gap-2">
        {districtHref ? (
          <Link
            href={districtHref}
            className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {debate.districtTag}
          </Link>
        ) : (
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {debate.districtTag}
          </span>
        )}
        <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-primary">
          {bucket === "live" ? "Live" : bucket === "concluded" ? "Judged" : "Open seat"}
        </span>
      </div>

      <Link href={`/debates/${debate.id}`} className="group mt-4 block">
        <h2 className="font-serif text-2xl font-semibold leading-snug tracking-tight text-parchment group-hover:text-primary">
          {debate.topic}
        </h2>
      </Link>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Seat label="Candidate A" seat={debate.candidateA} votes={tally.a} align="start" />
        <Seat label="Candidate B" seat={debate.candidateB} votes={tally.b} align="end" />
      </div>

      <p className="mt-4 font-mono text-xs tabular-nums text-parchment">
        Spectator votes · {debate.candidateA?.username ?? "A"} {tally.a} ·{" "}
        {debate.candidateB?.username ?? "B"} {tally.b}
      </p>

      {bucket === "concluded" ? (
        <div className="mt-4 rounded-lg border border-primary/25 bg-zinc-950/60 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
            AI judge
          </p>
          <p className="mt-2 text-sm leading-6 text-parchment">
            {winner ? `${winner} is the winner.` : "The match ended in a tie."}
          </p>
          {judgeReasoning ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{judgeReasoning}</p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              No written ruling on this match yet.
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function Seat({
  label,
  seat,
  votes,
  align,
}: {
  label: string;
  seat: DiscoverySeat | null;
  votes: number;
  align: "start" | "end";
}) {
  return (
    <div className={cn("flex flex-col gap-2", align === "end" && "sm:items-end sm:text-right")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      {seat ? (
        <Link
          href={`/candidate/${seat.id}`}
          className={cn("flex min-w-0 items-center gap-3", align === "end" && "sm:flex-row-reverse")}
        >
          <CandidateAvatar name={seat.username} size="md" />
          <span className="min-w-0">
            <span className="block font-serif text-base font-semibold text-parchment hover:text-primary">
              {seat.username}
            </span>
            <span className="mt-1 block font-mono text-xs tabular-nums text-primary">
              Elo {seat.elo}
            </span>
          </span>
        </Link>
      ) : (
        <p className="font-serif text-base text-muted-foreground">Open seat</p>
      )}
      <p className="font-mono text-xs tabular-nums text-muted-foreground">{votes} spectator votes</p>
    </div>
  );
}
