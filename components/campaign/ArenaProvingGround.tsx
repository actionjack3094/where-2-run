"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  challengeToDebate,
  findPrimaryOpponents,
  type PrimaryOpponent,
} from "@/app/actions/matchmaker";
import { CandidateIdentity } from "@/components/profile/CandidateAvatar";
import { Tier2Verification } from "@/components/verification/Tier2Verification";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { PRIMARY_OPPONENT_LIMIT } from "@/lib/ideology/stance";

type GroundStage = "booting" | "ready" | "error";

const LANE_LABELS = ["Primary rival", "Second lane", "Third lane"] as const;

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function ChallengeToDebateButton({
  opponentId,
  opponentName,
}: {
  opponentId: string;
  opponentName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await ensureArenaUser();
      const token = await accessToken();
      const result = await challengeToDebate(opponentId, token);
      router.push(`/debates/${result.matchId}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not open the debate.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        aria-label={`Challenge ${opponentName} to debate`}
        className="inline-flex h-11 items-center justify-center rounded-md bg-gold-strong px-4 font-display text-xs font-semibold uppercase tracking-[0.18em] text-zinc-950 transition-colors hover:bg-gold disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? "Opening arena…" : "Challenge to Debate"}
      </button>
      {error ? <p className="max-w-[16rem] text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

export function ArenaProvingGround() {
  const [stage, setStage] = useState<GroundStage>("booting");
  const [hasStance, setHasStance] = useState(false);
  const [matches, setMatches] = useState<PrimaryOpponent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await ensureArenaUser();
    const token = await accessToken();
    const result = await findPrimaryOpponents(token);
    setHasStance(result.hasStance);
    setMatches(result.matches);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setStage("ready");
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load ideological matches.",
          );
          setStage("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return (
    <section aria-labelledby="proving-ground-heading" className="mb-12">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            War Room
          </p>
          <h2
            id="proving-ground-heading"
            className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
          >
            Arena Proving Ground
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Cosine distance on your five-axis stance vector finds the {PRIMARY_OPPONENT_LIMIT}{" "}
            closest ideological matches — primary-lane rivals, not general-election opposites.
          </p>
        </div>
        <Link
          href="/onboarding/ideology"
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-md border border-gold/60 bg-zinc-950 px-5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-parchment transition-colors hover:border-gold hover:bg-zinc-900"
        >
          Retake Stance Quiz
        </Link>
      </div>

      <Tier2Verification />

      {stage === "booting" ? (
        <p className="rounded-xl border border-gold/30 bg-zinc-900 px-5 py-6 text-sm text-zinc-400">
          Ranking the closest vectors…
        </p>
      ) : null}

      {stage === "error" ? (
        <p className="rounded-xl border border-red-500/40 bg-zinc-900 px-5 py-6 text-sm text-red-300">
          {error ?? "Could not load ideological matches."}
        </p>
      ) : null}

      {stage === "ready" && !hasStance ? (
        <div className="rounded-xl border border-gold/30 bg-zinc-900 px-5 py-6">
          <p className="text-sm leading-6 text-zinc-400">
            File a baseline stance vector first. The proving ground ranks candidates by
            angular distance on those five axes.
          </p>
          <Link
            href="/onboarding/ideology"
            className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
          >
            Open baseline stance quiz
          </Link>
        </div>
      ) : null}

      {stage === "ready" && hasStance && matches.length === 0 ? (
        <p className="rounded-xl border border-gold/30 bg-zinc-900 px-5 py-6 text-sm leading-6 text-zinc-400">
          No other campaigns have filed a stance vector yet. Once they do, the closest
          three will land here.
        </p>
      ) : null}

      {stage === "ready" && matches.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {matches.map((opponent, index) => (
            <li
              key={opponent.id}
              className="flex flex-col gap-4 rounded-xl border border-gold/40 bg-zinc-900 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                  {LANE_LABELS[index] ?? `Lane ${index + 1}`}
                </p>
                <div className="mt-3">
                  <CandidateIdentity
                    id={opponent.id}
                    username={opponent.username}
                    verificationTier={opponent.verification_tier}
                    nameClassName="text-lg"
                  />
                </div>
                <p className="mt-3 text-sm tabular-nums text-zinc-400">
                  <span className="font-display font-semibold text-parchment">
                    {opponent.matchPercent}% match
                  </span>
                  <span className="mx-2 text-zinc-600">·</span>
                  cosine distance {opponent.cosine_distance.toFixed(3)}
                  <span className="mx-2 text-zinc-600">·</span>
                  ELO {opponent.elo_rating}
                </p>
              </div>
              <ChallengeToDebateButton
                opponentId={opponent.id}
                opponentName={opponent.username}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
