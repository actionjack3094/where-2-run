import Link from "next/link";
import { DisplayNameForm } from "@/app/dashboard/display-name-form";
import { AvatarUpload } from "@/app/profile/settings/avatar-upload";
import { PlatformEditor } from "@/app/profile/settings/platform/platform-editor";
import { IdeologyCompass, compassFromPlane } from "@/components/IdeologyCompass";
import { IDEOLOGY_VECTOR_TIP, InfoTooltip } from "@/components/InfoTooltip";
import type { loadCampaignRaces } from "@/lib/actions/campaign";

type Races = Awaited<ReturnType<typeof loadCampaignRaces>>;

export function IdentityPanel({
  userId,
  name,
  avatarUrl,
  verified,
  setup,
  ideologyX,
  ideologyY,
  hasCoordinate,
}: {
  userId: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  setup: string | null;
  ideologyX: number;
  ideologyY: number;
  hasCoordinate: boolean;
}) {
  const point = compassFromPlane(ideologyX, ideologyY);
  return (
    <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <div className="grid gap-6">
        {setup ? <p className="text-sm leading-6 text-stone-600">{setup}</p> : null}
        {setup ? null : (
          <>
            <AvatarUpload userId={userId} name={name} avatarUrl={avatarUrl} />
            <DisplayNameForm name={name} />
            <div className="rounded-xl border border-amber-500/30 bg-white px-5 py-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-600">Stripe KYC</p>
              {verified ? (
                <p className="mt-3 inline-flex rounded-full border border-gold px-3 py-1 text-[11px] uppercase tracking-widest text-amber-800">
                  Verified
                </p>
              ) : (
                <>
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    Stripe verification and a legal name are required before a primary leaderboard can list you as a
                    Declared Candidate or Frontrunner.
                  </p>
                  <Link
                    href="/verify"
                    className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800 hover:text-stone-900"
                  >
                    Verify identity
                  </Link>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <div className="rounded-xl border border-amber-500/30 bg-white px-5 py-5">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-stone-600">
          Ideology Vectors
          <InfoTooltip label="Ideology Vectors" text={IDEOLOGY_VECTOR_TIP} />
        </p>
        <div className="mt-4">
          <IdeologyCompass points={[{ x: point.x, y: point.y, name, avatarUrl }]} className="mx-auto w-full max-w-sm" />
        </div>
        <p className="mt-4 text-center text-sm leading-6 text-stone-600">
          {hasCoordinate
            ? `Economic ${ideologyX.toFixed(2)} · Social ${ideologyY.toFixed(2)}`
            : "Your coordinate appears after onboarding. Debate scores move only your own point."}
        </p>
      </div>
    </section>
  );
}

export function PlatformPanel({ races, error }: { races: Races; error: string | null }) {
  return (
    <section className="mt-8 max-w-xl">
      {error ? <p className="text-sm leading-6 text-stone-600">{error}</p> : null}
      {!error && races.length === 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-white px-5 py-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-600">Locked</p>
          <p className="mt-3 text-sm leading-6 text-stone-900">
            The platform editor opens at Declared Candidate: top 50% Civic Standing in a primary, with Stripe
            verification and a legal name on the profile.
          </p>
          <Link
            href="/verify"
            className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800 hover:text-stone-900"
          >
            Verify identity
          </Link>
        </div>
      ) : null}
      {!error && races.length > 0 ? <PlatformEditor races={races} /> : null}
    </section>
  );
}
