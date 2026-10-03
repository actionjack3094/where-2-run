"use client";

import Link from "next/link";
import { useState } from "react";
import { registerAsVolunteer } from "@/lib/actions/campaign";
import type { PublishedPlatform } from "@/lib/actions/campaign";
import type { ProfileDebate } from "@/lib/platform/public-profile";
import { tierLabel } from "@/lib/platform/types";
import { ReportDebateButton } from "@/components/platform/ReportDebateButton";
import { TownHall } from "@/components/platform/TownHall";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function DebateHistory({
  history,
  profileId,
  profileName,
  viewerId,
  viewerVerified,
}: {
  history: ProfileDebate[];
  profileId: string;
  profileName: string;
  viewerId: string | null;
  viewerVerified: boolean;
}) {
  if (history.length === 0) {
    return <p className="mt-3 text-sm text-zinc-400">No concluded debates yet.</p>;
  }
  return (
    <ul className="mt-4 grid gap-4">
      {history.map((debate) => (
        <li key={debate.id} className="rounded-xl border border-zinc-800 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500">
              {debate.office} · {debate.result} · vs {debate.opponentName}
            </p>
            <ReportDebateButton
              debateId={debate.id}
              viewerId={viewerId}
              participants={[{ id: profileId, name: profileName }]}
            />
          </div>
          <h3 className="mt-2 text-sm font-medium text-parchment">{debate.prompt}</h3>
          {debate.ownStance ? <p className="mt-2 text-sm leading-6 text-zinc-300">{debate.ownStance}</p> : null}
          <TownHall
            debateId={debate.id}
            questions={debate.questions}
            viewerId={viewerId}
            verified={viewerVerified}
            candidateAId={debate.candidateAId}
            candidateBId={debate.candidateBId}
          />
        </li>
      ))}
    </ul>
  );
}

function VolunteerButton({
  campaignUserId,
  primaryId,
  signedIn,
  already,
}: {
  campaignUserId: string;
  primaryId: string;
  signedIn: boolean;
  already: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(already ? "Your volunteer request is pending." : null);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link
        href={`/auth/login?next=${encodeURIComponent(`/profile/${campaignUserId}`)}`}
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-md bg-gold-strong font-display text-sm font-semibold uppercase tracking-[0.18em] text-zinc-950"
      >
        Volunteer for Campaign
      </Link>
    );
  }

  return (
    <form
      className="mt-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || message) return;
        setPending(true);
        setError(null);
        void registerAsVolunteer(campaignUserId, primaryId).then((result) => {
          setMessage(result.message ?? null);
          setError(result.error ?? null);
          setPending(false);
        });
      }}
    >
      <Button type="submit" variant="gold" size="full" disabled={pending || Boolean(message)}>
        {message ? "Request sent" : pending ? "Sending…" : "Volunteer for Campaign"}
      </Button>
      {message ? <p className="mt-3 text-sm leading-6 text-parchment">{message}</p> : null}
      {error ? <p className="mt-3 text-sm leading-6 text-zinc-300">{error}</p> : null}
    </form>
  );
}

export function ProfileSections({
  history,
  platforms,
  campaignUserId,
  profileName,
  viewerId,
  viewerVerified,
  volunteeredPrimaryIds,
}: {
  history: ProfileDebate[];
  platforms: PublishedPlatform[];
  campaignUserId: string;
  profileName: string;
  viewerId: string | null;
  viewerVerified: boolean;
  volunteeredPrimaryIds: string[];
}) {
  const [tab, setTab] = useState<"history" | "platform">("history");
  const volunteered = new Set(volunteeredPrimaryIds);

  return (
    <section className="mt-10">
      <div role="tablist" aria-label="Profile sections" className="flex flex-wrap gap-2">
        {(
          [
            ["history", "Debate History"],
            ["platform", "Campaign Platform"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest transition-colors",
              tab === id
                ? "bg-gold-strong text-zinc-950"
                : "border border-gold/40 text-zinc-400 hover:border-gold hover:text-parchment",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "history" ? (
        <div className="mt-6">
          <h2 className="font-display text-xl text-parchment">Debate history</h2>
          <DebateHistory
            history={history}
            profileId={campaignUserId}
            profileName={profileName}
            viewerId={viewerId}
            viewerVerified={viewerVerified}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          <h2 className="font-display text-xl text-parchment">Campaign Platform</h2>
          {platforms.map((platform) => (
            <article key={platform.primaryId} className="rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
              <p className="text-[11px] uppercase tracking-widest text-gold">
                {platform.label} · {tierLabel(platform.tier)}
              </p>
              <p className="mt-3 text-sm leading-6 text-parchment">{platform.manifesto}</p>
              <ul className="mt-4 grid gap-2">
                {platform.keyPolicies.map((policy) => (
                  <li key={policy} className="text-sm leading-6 text-zinc-300">
                    {policy}
                  </li>
                ))}
              </ul>
              {platform.tier === "frontrunner" && viewerId !== campaignUserId ? (
                <VolunteerButton
                  campaignUserId={campaignUserId}
                  primaryId={platform.primaryId}
                  signedIn={Boolean(viewerId)}
                  already={volunteered.has(platform.primaryId)}
                />
              ) : null}
              {viewerId === campaignUserId ? (
                <Link
                  href="/profile/settings/platform"
                  className="mt-5 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
                >
                  Edit platform
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
