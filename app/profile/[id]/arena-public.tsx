import Link from "next/link";
import { ArenaRankSummary } from "@/app/profile/[id]/arena-rank-summary";
import { ProfileHistory } from "@/app/profile/[id]/profile-history";
import { ProfileSections } from "@/app/profile/[id]/profile-sections";
import { IdeologyCompass, compassFromPlane } from "@/components/IdeologyCompass";
import { IDEOLOGY_COMPASS_TIP, InfoTooltip } from "@/components/InfoTooltip";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { MatchConfidence } from "@/components/ballot/MatchConfidence";
import { PledgeDecisions } from "@/components/pledges/PledgeDecisions";
import { stanceIsStale } from "@/lib/ballot/fading";
import { formatUsd } from "@/lib/pledges";
import type { PublishedPlatform } from "@/lib/actions/campaign";
import type { ArenaPublicProfile } from "@/lib/platform/public-profile";

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
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">Public profile</p>
        <div className="mt-3 flex items-center gap-4">
          <CandidateAvatar name={profile.name} avatarUrl={profile.avatarUrl} size="lg" />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">{profile.name}</h1>
        </div>
        <ArenaRankSummary profile={profile} />
        {profile.showVerified ? (
          <p className="mt-3 text-[11px] uppercase tracking-widest text-stone-600">Verified</p>
        ) : null}
        {profile.bio ? <p className="mt-4 max-w-xl text-sm leading-6 text-stone-600">{profile.bio}</p> : null}
      </header>

      {profile.ideologyX != null && profile.ideologyY != null ? (
        <MatchConfidence percent={null} stale={stanceIsStale(profile.lastStanceAt)} />
      ) : null}
      {viewerId === profile.id && profile.civicCredit > 0 ? (
        <p className="mt-4 text-sm text-stone-600">Civic Credit {formatUsd(profile.civicCredit)}</p>
      ) : null}
      {viewerId === profile.id ? <PledgeDecisions pledges={profile.pendingPledges} /> : null}
      {profile.unbought.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-xl text-stone-900">Unbought</h2>
          <ul className="mt-3 grid gap-2">
            {profile.unbought.map((pledge) => (
              <li key={pledge.id} className="text-sm text-stone-600">
                Rejected {formatUsd(pledge.amount)} from{" "}
                <Link href={`/entities/${pledge.entitySlug}`} className="text-amber-800">
                  {pledge.entityName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-stone-900">
          Ideology Compass
          <InfoTooltip label="Ideology Compass" text={IDEOLOGY_COMPASS_TIP} />
        </h2>
        {profile.ideologyX == null || profile.ideologyY == null ? (
          <p className="mt-3 text-sm text-stone-600">No coordinate filed yet.</p>
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
            <p className="mt-3 text-sm text-stone-600">
              Economic {profile.ideologyX.toFixed(2)} · Social {profile.ideologyY.toFixed(2)}
            </p>
          </div>
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
        <ProfileHistory profile={profile} viewerId={viewerId} viewerVerified={viewerVerified} />
      )}
    </>
  );
}
