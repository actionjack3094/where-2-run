"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChallengeButton } from "@/components/ChallengeButton";
import { VoterPostActions } from "@/components/feed/VoterPostActions";
import { CandidateIdentity } from "@/components/profile/CandidateAvatar";
import {
  DEFAULT_STANCE_DISTRICT,
  TakeStanceModal,
} from "@/components/TakeStanceModal";
import { unwrapCandidate } from "@/lib/arena/display";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";
import { isMissingVerificationColumn, parseVerificationTier } from "@/lib/verification";
import type {
  CivicPost,
  DebateCandidate,
  DebateWithCandidates,
  District,
  MatchedFeedPost,
  VerificationTier,
} from "@/types/database.types";

const ACTIVE_DEBATE_STATUSES = ["matching", "active", "voting"] as const;

export type FeedItem =
  | {
      role: "voter";
      id: string;
      createdAt: string;
      title: string;
      body: string;
      status: string;
      districtName: string;
      candidateA: DebateCandidate | null;
      candidateB: DebateCandidate | null;
      votingOpen: boolean;
    }
  | {
      role: "candidate";
      id: string;
      createdAt: string;
      title: string;
      body: string;
      similarity: number | string | null;
      author: DebateCandidate | null;
    };

function formatMatchPercent(similarity: number | string | null) {
  if (similarity == null) return "OPEN";
  const value = typeof similarity === "string" ? Number(similarity) : similarity;
  if (!Number.isFinite(value)) return "OPEN";
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}% MATCH`;
}

function statusLabel(status: string) {
  if (status === "matching") return "Matching";
  if (status === "voting") return "Voting";
  return "Active";
}

function createdAtValue(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function sameDistrict(value: string | null | undefined, district: Pick<District, "id" | "name">) {
  return value === district.id || value === district.name;
}

export function BallotFeed() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stage, setStage] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [viewerTier, setViewerTier] = useState<VerificationTier>("unverified");

  async function loadFeed() {
    setError(null);

    try {
      const arenaUser = await ensureArenaUser();
      const { data: viewerRow, error: viewerError } = await supabase
        .from("users")
        .select("verification_tier")
        .eq("id", arenaUser.id)
        .maybeSingle();

      if (viewerError && !isMissingVerificationColumn(viewerError)) {
        throw new Error(viewerError.message);
      }

      setViewerTier(
        parseVerificationTier(
          (viewerRow as { verification_tier?: string } | null)?.verification_tier,
        ),
      );
    } catch {
      setViewerTier("unverified");
    }

    const { data: districtRows, error: districtError } = await supabase
      .from("districts")
      .select("id, name")
      .order("name");

    if (districtError) {
      setError(districtError.message);
      setStage("error");
      return;
    }

    const districts = (districtRows ?? []) as Pick<District, "id" | "name">[];
    const storedId = window.sessionStorage.getItem(STORAGE_KEYS.districtId);
    const home =
      districts.find((entry) => entry.id === storedId) ??
      districts.find((entry) => entry.name === DEFAULT_STANCE_DISTRICT) ??
      districts[0] ??
      null;

    if (home) {
      window.sessionStorage.setItem(STORAGE_KEYS.districtId, home.id);
    }

    const [{ data: posts, error: postsError }, { data: debates, error: debateError }, { data: civic, error: civicError }] =
      await Promise.all([
        supabase.rpc("get_matched_feed", {
          viewer_embedding: "[0.5, -0.2, 0.8]",
          target_district: home?.name ?? DEFAULT_STANCE_DISTRICT,
          match_count: 10,
        }),
        supabase
          .from("debates")
          .select(
            `
            *,
            candidate_a:users!debates_candidate_a_id_fkey ( id, username ),
            candidate_b:users!debates_candidate_b_id_fkey ( id, username )
          `,
          )
          .in("status", [...ACTIVE_DEBATE_STATUSES])
          .order("created_at", { ascending: false }),
        supabase
          .from("civic_posts")
          .select("id, claim, argument, status, district_id, created_at, author_id")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    if (postsError && debateError && civicError) {
      setError(postsError.message || debateError.message || civicError.message);
      setStage("error");
      return;
    }

    const similarityById = new Map<string, number | string>();
    for (const post of (posts ?? []) as MatchedFeedPost[]) {
      const id = post.id || post.post_id;
      if (id) similarityById.set(id, post.similarity);
    }

    const civicPosts = (civic ?? []) as Pick<
      CivicPost,
      "id" | "claim" | "argument" | "status" | "district_id" | "created_at" | "author_id"
    >[];
    const authorIds = [
      ...new Set(civicPosts.map((post) => post.author_id).filter(Boolean)),
    ];
    const { data: authorRows } = authorIds.length
      ? await supabase.from("users").select("id, username").in("id", authorIds)
      : { data: [] as DebateCandidate[] };
    const authorById = new Map(
      ((authorRows ?? []) as DebateCandidate[]).map((row) => [row.id, row]),
    );

    const candidateById = new Map<string, FeedItem>();
    for (const post of civicPosts) {
      if (post.status && post.status !== "open") continue;
      candidateById.set(post.id, {
        role: "candidate",
        id: post.id,
        createdAt: post.created_at,
        title: post.claim,
        body: post.argument,
        similarity: similarityById.get(post.id) ?? null,
        author: authorById.get(post.author_id) ?? null,
      });
    }
    for (const [id, similarity] of similarityById) {
      if (candidateById.has(id)) continue;
      const matched = ((posts ?? []) as MatchedFeedPost[]).find(
        (post) => (post.id || post.post_id) === id,
      );
      if (!matched) continue;
      candidateById.set(id, {
        role: "candidate",
        id,
        createdAt: "",
        title: matched.claim,
        body: matched.argument,
        similarity,
        author: null,
      });
    }

    const voterItems: FeedItem[] = ((debates ?? []) as DebateWithCandidates[])
      .filter((debate) => (home ? sameDistrict(debate.district_id, home) : true))
      .map((debate) => {
        const candidateA = unwrapCandidate(debate.candidate_a);
        const candidateB = unwrapCandidate(debate.candidate_b);
        return {
          role: "voter" as const,
          id: debate.id,
          createdAt: debate.created_at,
          title: debate.topic,
          body: `${candidateA?.username ?? "Open seat"} vs ${candidateB?.username ?? "awaiting challenger"}`,
          status: debate.status,
          districtName: home?.name ?? DEFAULT_STANCE_DISTRICT,
          candidateA,
          candidateB,
          votingOpen:
            (debate.status === "active" || debate.status === "voting") &&
            Boolean(candidateA && candidateB),
        };
      });

    const next = [...voterItems, ...candidateById.values()].sort(
      (left, right) => createdAtValue(right.createdAt) - createdAtValue(left.createdAt),
    );

    setFeed(next);
    setStage("ready");
  }

  useEffect(() => {
    void loadFeed();
  }, []);

  if (stage === "loading") {
    return <p className="mt-16 text-sm leading-6 text-zinc-400">Loading the ballot…</p>;
  }

  if (stage === "error") {
    return (
      <div className="mt-16 space-y-4">
        <p className="text-sm leading-6 text-zinc-400">{error ?? "Could not load the feed."}</p>
        <button
          type="button"
          onClick={() => {
            setStage("loading");
            void loadFeed();
          }}
          className="inline-flex h-9 items-center justify-center rounded-md border border-gold/50 bg-zinc-800 px-3 text-xs font-medium uppercase tracking-widest text-parchment"
        >
          Try again
        </button>
      </div>
    );
  }

  if (feed.length === 0) {
    return (
      <p className="mt-16 text-sm leading-6 text-zinc-400">
        No active debates or open challenges in your races yet.
      </p>
    );
  }

  return (
    <section className="mt-10 flex flex-col gap-4">
      {feed.map((item) => (
        <article
          key={`${item.role}-${item.id}`}
          data-feed-role={item.role}
          className="rounded-xl border border-accent/60 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--accent)]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/40 bg-accent-muted px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-accent-ring">
              {item.role === "voter" ? "Voter: District Watch" : "Candidate: Open Challenge"}
            </span>
            {item.role === "voter" ? (
              <span className="rounded-full border border-accent/30 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
                {statusLabel(item.status)}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {item.role === "voter" ? (
              <Link href={`/debates/${item.id}`} className="min-w-0">
                <h2 className="text-lg font-semibold leading-snug tracking-tight text-parchment hover:text-accent-ring">
                  {item.title}
                </h2>
              </Link>
            ) : (
              <h2 className="text-lg font-semibold leading-snug tracking-tight text-parchment">
                {item.title}
              </h2>
            )}
            {item.role === "candidate" ? (
              <p className="shrink-0 font-mono text-xs font-medium uppercase text-accent-ring">
                {formatMatchPercent(item.similarity)}
              </p>
            ) : (
              <p className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-accent-ring">
                {item.districtName}
              </p>
            )}
          </div>

          {item.role === "voter" ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {item.candidateA ? (
                <CandidateIdentity
                  id={item.candidateA.id}
                  username={item.candidateA.username}
                  size="sm"
                  nameClassName="text-sm"
                />
              ) : (
                <span className="text-sm text-zinc-500">Open seat</span>
              )}
              <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                vs
              </span>
              {item.candidateB ? (
                <CandidateIdentity
                  id={item.candidateB.id}
                  username={item.candidateB.username}
                  size="sm"
                  nameClassName="text-sm"
                />
              ) : (
                <span className="text-sm text-zinc-500">Awaiting challenger</span>
              )}
            </div>
          ) : (
            <>
              {item.author ? (
                <div className="mt-4">
                  <CandidateIdentity
                    id={item.author.id}
                    username={item.author.username}
                    size="sm"
                    nameClassName="text-sm"
                  />
                </div>
              ) : null}
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-400">{item.body}</p>
            </>
          )}

          {item.role === "voter" ? (
            <VoterPostActions
              debateId={item.id}
              candidateA={item.candidateA}
              candidateB={item.candidateB}
              votingOpen={item.votingOpen}
              verificationTier={viewerTier}
            />
          ) : (
            <div className="mt-5 flex flex-wrap items-start gap-2">
              <TakeStanceModal compact />
              <ChallengeButton postId={item.id} />
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
