"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toggleEndorsement } from "@/app/actions/coalition/toggle-endorsement";
import { Button } from "@/components/ui/button";
import { CandidateIdentity } from "@/components/profile/CandidateAvatar";
import { parseElo } from "@/lib/arena/elo";
import { isMissingRelation } from "@/lib/coalitions";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";

type NetworkCard = {
  id: string;
  name: string;
  eloRating: number;
  matchPercent: number | null;
  endorsedByCandidate: boolean;
  endorsesCandidate: boolean;
  viewerEndorses: boolean;
};

type EndorsementRow = {
  endorser_id?: string;
  endorsed_id?: string;
};

type PersonRow = {
  id: string;
  username: string | null;
  elo_rating: number | null;
};

function displayName(username: string | null | undefined, id: string) {
  const trimmed = username?.trim();
  if (trimmed) return trimmed;
  return `Candidate ${id.slice(0, 6)}`;
}

function matchLabel(matchPercent: number | null) {
  return matchPercent == null ? "—" : `${matchPercent}%`;
}

export function CoalitionNetwork({
  candidateId,
  className,
}: {
  candidateId: string;
  className?: string;
}) {
  const [cards, setCards] = useState<NetworkCard[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerEndorsesCandidate, setViewerEndorsesCandidate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    const stillCurrent = () => current === requestId.current;
    setLoading(true);
    setError(null);

    const session = await supabase.auth.getSession();
    if (!stillCurrent()) return;
    const nextViewerId = session.data.session?.user.id ?? null;
    setViewerId(nextViewerId);

    const [outgoing, incoming] = await Promise.all([
      supabase
        .from("coalition_endorsements")
        .select("endorsed_id")
        .eq("endorser_id", candidateId),
      supabase
        .from("coalition_endorsements")
        .select("endorser_id")
        .eq("endorsed_id", candidateId),
    ]);

    if (!stillCurrent()) return;

    const relationError = outgoing.error ?? incoming.error;
    if (relationError) {
      setCards([]);
      setViewerEndorsesCandidate(false);
      setError(
        isMissingRelation(relationError)
          ? "Endorsements are not on the database yet. Apply the coalition endorsements migration."
          : relationError.message,
      );
      setLoading(false);
      return;
    }

    const endorsedIds = new Set(
      ((outgoing.data ?? []) as EndorsementRow[])
        .map((row) => row.endorsed_id)
        .filter((id): id is string => Boolean(id) && id !== candidateId),
    );
    const endorserIds = new Set(
      ((incoming.data ?? []) as EndorsementRow[])
        .map((row) => row.endorser_id)
        .filter((id): id is string => Boolean(id) && id !== candidateId),
    );
    const ids = [...new Set([...endorsedIds, ...endorserIds])];

    let viewerEndorsed = new Set<string>();
    if (nextViewerId) {
      const targets = [...new Set([...ids, candidateId])];
      const mine = await supabase
        .from("coalition_endorsements")
        .select("endorsed_id")
        .eq("endorser_id", nextViewerId)
        .in("endorsed_id", targets);

      if (!mine.error) {
        viewerEndorsed = new Set(
          ((mine.data ?? []) as EndorsementRow[])
            .map((row) => row.endorsed_id)
            .filter((id): id is string => Boolean(id)),
        );
      }
    }

    if (!stillCurrent()) return;

    setViewerEndorsesCandidate(
      nextViewerId != null &&
        nextViewerId !== candidateId &&
        viewerEndorsed.has(candidateId),
    );

    if (ids.length === 0) {
      setCards([]);
      setLoading(false);
      return;
    }

    const peopleQuery = await supabase
      .from("users")
      .select("id, username, elo_rating")
      .in("id", ids);

    const people = peopleQuery.error
      ? []
      : ((peopleQuery.data ?? []) as PersonRow[]);
    const peopleById = new Map(people.map((person) => [person.id, person]));

    const matches = await Promise.all(
      ids.map(async (id) => {
        const { data, error: matchError } = await supabase.rpc(
          "calculate_user_compatibility",
          { user_a: candidateId, user_b: id },
        );
        if (matchError || data == null || !Number.isFinite(Number(data))) {
          return [id, null] as const;
        }
        return [id, Math.max(0, Math.min(100, Math.round(Number(data))))] as const;
      }),
    );
    if (!stillCurrent()) return;

    const matchById = new Map(matches);

    const nextCards = ids
      .map((id) => {
        const person = peopleById.get(id);
        return {
          id,
          name: displayName(person?.username, id),
          eloRating: parseElo(person?.elo_rating),
          matchPercent: matchById.get(id) ?? null,
          endorsedByCandidate: endorsedIds.has(id),
          endorsesCandidate: endorserIds.has(id),
          viewerEndorses: viewerEndorsed.has(id),
        };
      })
      .sort((left, right) => {
        if (left.endorsedByCandidate !== right.endorsedByCandidate) {
          return left.endorsedByCandidate ? -1 : 1;
        }
        return (right.matchPercent ?? -1) - (left.matchPercent ?? -1);
      });

    setCards(nextCards);
    setLoading(false);
  }, [candidateId]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  async function onToggle(targetId: string) {
    setPendingId(targetId);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      await toggleEndorsement(targetId, data.session?.access_token ?? null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this endorsement.");
      setLoading(false);
    } finally {
      setPendingId(null);
    }
  }

  const canEndorseCandidate = viewerId != null && viewerId !== candidateId;

  return (
    <section aria-labelledby="coalition-network-heading" className={cn(className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Coalition network
          </p>
          <h2
            id="coalition-network-heading"
            className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
          >
            Endorsements
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Campaigns this candidate has endorsed, and campaigns that have endorsed
            them. Match is the cosine similarity of their six-axis ideology vectors.
          </p>
        </div>
        {canEndorseCandidate ? (
          <Button
            type="button"
            variant={viewerEndorsesCandidate ? "outline" : "gold"}
            size="sm"
            className="shrink-0"
            disabled={pendingId === candidateId}
            onClick={() => void onToggle(candidateId)}
          >
            {pendingId === candidateId
              ? "Saving…"
              : viewerEndorsesCandidate
                ? "Withdraw endorsement"
                : "Endorse"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-6 text-sm leading-6 text-zinc-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading && cards.length === 0 && !error ? (
        <p className="mt-8 text-sm leading-6 text-zinc-400">Loading endorsements…</p>
      ) : null}

      {!loading && !error && cards.length === 0 ? (
        <p className="mt-8 text-sm leading-6 text-zinc-400">
          No endorsements on this campaign yet.
        </p>
      ) : null}

      {cards.length > 0 ? (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.id}>
              <article className="flex h-full flex-col gap-4 rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]">
                <div className="flex items-start justify-between gap-4">
                  <CandidateIdentity id={card.id} username={card.name} />
                  <p
                    className="shrink-0 text-right"
                    aria-label={`ELO ${card.eloRating}`}
                  >
                    <span className="block font-display text-3xl font-semibold tabular-nums tracking-tight text-gold">
                      {card.eloRating}
                    </span>
                    <span className="mt-1 block text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                      ELO
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-gold/70 bg-zinc-950 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-gold">
                    Ideological Match {matchLabel(card.matchPercent)}
                  </span>
                  {card.endorsedByCandidate ? (
                    <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                      Endorsed
                    </span>
                  ) : null}
                  {card.endorsesCandidate ? (
                    <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                      Endorses this campaign
                    </span>
                  ) : null}
                </div>

                {viewerId && viewerId !== card.id ? (
                  <Button
                    type="button"
                    variant={card.viewerEndorses ? "outline" : "gold"}
                    size="sm"
                    className="mt-auto w-fit"
                    disabled={pendingId === card.id}
                    onClick={() => void onToggle(card.id)}
                  >
                    {pendingId === card.id
                      ? "Saving…"
                      : card.viewerEndorses
                        ? "Withdraw"
                        : card.endorsesCandidate
                          ? "Endorse back"
                          : "Endorse"}
                  </Button>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
