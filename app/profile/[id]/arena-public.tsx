import Link from "next/link";
import { ProfileSections } from "@/app/profile/[id]/profile-sections";
import { IdeologyCompass, compassFromPlane } from "@/components/IdeologyCompass";
import { CIVIC_STANDING_TIP, IDEOLOGY_COMPASS_TIP, InfoTooltip } from "@/components/InfoTooltip";
import { ReportDebateButton } from "@/components/platform/ReportDebateButton";
import { TownHall } from "@/components/platform/TownHall";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { MatchConfidence } from "@/components/ballot/MatchConfidence";
import { PledgeDecisions } from "@/components/pledges/PledgeDecisions";
import { PledgeFundsCard } from "@/components/support/PledgeFundsCard";
import { stanceIsStale } from "@/lib/ballot/fading";
import { formatUsd } from "@/lib/pledges";
import type { PublishedPlatform } from "@/lib/actions/campaign";
import type { ArenaPublicProfile } from "@/lib/platform/public-profile";
import { tierLabel } from "@/lib/platform/types";

export function ArenaPublicProfileView({
  profile,
  platforms = [],
  viewerId = null,
  viewerVerified = false,
  volunteeredPrimaryIds = [],
}: {
  profile: ArenaPublicProfile;
  platforms?: PublishedPlatform[];
  viewerId?: string | null;
  viewerVerified?: boolean;
  volunteeredPrimaryIds?: string[];
}) {
  return (
    <>
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Public profile</p>
        <div className="mt-3 flex items-center gap-4">
          <CandidateAvatar name={profile.name} avatarUrl={profile.avatarUrl} size="lg" />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-parchment">
            {profile.name}
          </h1>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-widest text-zinc-400">
          <span className="rounded-full border border-gold px-2 py-0.5 text-gold">{profile.tierLabel}</span>
          {profile.showVerified ? <span>Verified</span> : null}
        </p>
        {profile.bio ? <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-300">{profile.bio}</p> : null}
      </header>

      <PledgeFundsCard
        candidateId={profile.id}
        signedIn={Boolean(viewerId)}
        chests={profile.warChests}
      />
      {profile.ideologyX != null && profile.ideologyY != null ? (
        <MatchConfidence percent={null} stale={stanceIsStale(profile.lastStanceAt)} />
      ) : null}
      {viewerId === profile.id && profile.civicCredit > 0 ? (
        <p className="mt-4 text-sm text-zinc-300">Civic Credit {formatUsd(profile.civicCredit)}</p>
      ) : null}
      {viewerId === profile.id ? <PledgeDecisions pledges={profile.pendingPledges} /> : null}
      {profile.unbought.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-xl text-parchment">Unbought</h2>
          <ul className="mt-3 grid gap-2">
            {profile.unbought.map((pledge) => (
              <li key={pledge.id} className="text-sm text-zinc-300">
                Rejected {formatUsd(pledge.amount)} from{" "}
                <Link href={`/entities/${pledge.entitySlug}`} className="text-gold">
                  {pledge.entityName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-parchment">
          Ideology Compass
          <InfoTooltip label="Ideology Compass" text={IDEOLOGY_COMPASS_TIP} />
        </h2>
        {profile.ideologyX == null || profile.ideologyY == null ? (
          <p className="mt-3 text-sm text-zinc-400">No coordinate filed yet.</p>
        ) : (
          <div className="mt-4">
            <IdeologyCompass
              points={[
                {
                  ...compassFromPlane(profile.ideologyX, profile.ideologyY),
                  name: profile.name,
                  avatarUrl: profile.avatarUrl,
                },
              ]}
            />
            <p className="mt-3 text-sm text-zinc-400">
              Economic {profile.ideologyX.toFixed(2)} · Social {profile.ideologyY.toFixed(2)}
            </p>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-parchment">
          Primaries
          <InfoTooltip label="Civic Standing" text={CIVIC_STANDING_TIP} />
        </h2>
        {profile.standings.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No finished debates in a primary yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {profile.standings.map((row) => (
              <li key={row.primaryId} className="rounded-xl border border-zinc-800 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {row.slug ? (
                    <Link href={`/elections/${row.slug}`} className="text-sm font-medium text-parchment hover:text-gold">
                      {row.label}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-parchment">{row.label}</p>
                  )}
                  <p className="text-sm text-zinc-300">{row.civicStanding} Civic Standing</p>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-widest text-zinc-500">
                  {tierLabel(row.tier)} · Rank {row.rank} of {row.fieldSize} · {row.debatesLogged} Debates Logged · {row.policyConsistency}% Policy Consistency
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {platforms.length > 0 ? (
        <ProfileSections
          history={profile.history}
          platforms={platforms}
          campaignUserId={profile.id}
          profileName={profile.name}
          viewerId={viewerId}
          viewerVerified={viewerVerified}
          volunteeredPrimaryIds={volunteeredPrimaryIds}
        />
      ) : (
        <section className="mt-10">
          <h2 className="font-display text-xl text-parchment">Debate history</h2>
          {profile.history.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No concluded debates yet.</p>
          ) : (
            <ul className="mt-4 grid gap-4">
              {profile.history.map((debate) => (
                <li key={debate.id} className="rounded-xl border border-zinc-800 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                      {debate.office} · {debate.result} · vs {debate.opponentName}
                    </p>
                    <ReportDebateButton
                      debateId={debate.id}
                      viewerId={viewerId}
                      participants={[{ id: profile.id, name: profile.name }]}
                    />
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-parchment">{debate.prompt}</h3>
                  {debate.ownStance ? (
                    <p className="mt-2 text-sm leading-6 text-zinc-300">{debate.ownStance}</p>
                  ) : null}
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
          )}
        </section>
      )}
    </>
  );
}
