import { ReportDebateButton } from "@/components/platform/ReportDebateButton";
import { TownHall } from "@/components/platform/TownHall";
import type { ArenaPublicProfile } from "@/lib/platform/public-profile";

export function ProfileHistory({
  profile,
  viewerId,
  viewerVerified,
}: {
  profile: ArenaPublicProfile;
  viewerId: string | null;
  viewerVerified: boolean;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl text-stone-900">Debate history</h2>
      {profile.history.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">No concluded debates yet.</p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {profile.history.map((debate) => (
            <li key={debate.id} className="rounded-xl border border-amber-500/30 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-widest text-stone-600">
                  {debate.office} · {debate.result} · vs {debate.opponentName}
                </p>
                <ReportDebateButton
                  debateId={debate.id}
                  viewerId={viewerId}
                  participants={[{ id: profile.id, name: profile.name }]}
                />
              </div>
              <h3 className="mt-2 text-sm font-medium text-stone-900">{debate.prompt}</h3>
              {debate.ownStance ? <p className="mt-2 text-sm leading-6 text-stone-600">{debate.ownStance}</p> : null}
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
  );
}
