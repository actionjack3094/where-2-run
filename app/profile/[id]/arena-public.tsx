import Link from "next/link";
import { ProfileSections } from "@/app/profile/[id]/profile-sections";
import type { PublishedPlatform } from "@/lib/actions/campaign";
import type { ArenaPublicProfile } from "@/lib/platform/public-profile";
import { tierLabel } from "@/lib/platform/types";

function clampAxis(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

export function IdeologyCompass({ x, y }: { x: number; y: number }) {
  const left = ((clampAxis(x) + 1) / 2) * 100;
  const top = ((1 - clampAxis(y)) / 2) * 100;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Social +1</p>
      <div className="relative mt-2 aspect-square w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-950">
        <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-800" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-800" />
        <span
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold bg-gold"
          style={{ left: `${left}%`, top: `${top}%` }}
        />
      </div>
      <div className="mt-2 flex max-w-sm justify-between text-[11px] uppercase tracking-[0.16em] text-zinc-500">
        <span>Economic −1</span>
        <span>Economic +1</span>
      </div>
      <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-zinc-500">Social −1</p>
    </div>
  );
}

export function ArenaPublicProfileView({
  profile,
  platforms = [],
  viewerId = null,
  volunteeredPrimaryIds = [],
}: {
  profile: ArenaPublicProfile;
  platforms?: PublishedPlatform[];
  viewerId?: string | null;
  volunteeredPrimaryIds?: string[];
}) {
  return (
    <>
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Public profile</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
          {profile.name}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-widest text-zinc-400">
          <span className="rounded-full border border-gold px-2 py-0.5 text-gold">{profile.tierLabel}</span>
          {profile.showVerified ? <span>Verified</span> : null}
        </p>
      </header>

      <section className="mt-10">
        <h2 className="font-display text-xl text-parchment">Ideology</h2>
        {profile.ideologyX == null || profile.ideologyY == null ? (
          <p className="mt-3 text-sm text-zinc-400">No coordinate filed yet.</p>
        ) : (
          <div className="mt-4">
            <IdeologyCompass x={profile.ideologyX} y={profile.ideologyY} />
            <p className="mt-3 text-sm text-zinc-400">
              Economic {profile.ideologyX.toFixed(2)} · Social {profile.ideologyY.toFixed(2)}
            </p>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-parchment">Primaries</h2>
        {profile.standings.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No finished debates in a primary yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {profile.standings.map((row) => (
              <li key={row.primaryId} className="rounded-xl border border-zinc-800 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {row.slug ? (
                    <Link href={`/primaries/${row.slug}`} className="text-sm font-medium text-parchment hover:text-gold">
                      {row.label}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-parchment">{row.label}</p>
                  )}
                  <p className="text-sm text-zinc-300">{row.elo} Elo</p>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-widest text-zinc-500">
                  {tierLabel(row.tier)} · Rank {row.rank} of {row.fieldSize} · {row.wins}-{row.losses}-{row.ties}
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
          viewerId={viewerId}
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
                  <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                    {debate.office} · {debate.result} · vs {debate.opponentName}
                  </p>
                  <h3 className="mt-2 text-sm font-medium text-parchment">{debate.prompt}</h3>
                  {debate.ownStance ? (
                    <p className="mt-2 text-sm leading-6 text-zinc-300">{debate.ownStance}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
