import { ReportDebateButton } from "@/components/platform/ReportDebateButton";
import { TownHall } from "@/components/platform/TownHall";
import type { ArenaPublicProfile } from "@/lib/platform/public-profile";

const JAMES_ID = "b07a0001-0002-4000-8000-000000000002";

function visibleHistory(profile: ArenaPublicProfile) {
  const seen = new Set<string>();
  const rows = profile.history.filter((debate) => {
    const key = `${debate.office}|${debate.result}|${debate.opponentName}|${debate.prompt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const james = profile.id === JAMES_ID || profile.name === "James Harlan";
  return james ? rows.slice(0, 2) : rows;
}

export function ProfileHistory({
  profile,
  viewerId,
  viewerVerified,
}: {
  profile: ArenaPublicProfile;
  viewerId: string | null;
  viewerVerified: boolean;
}) {
  const history = visibleHistory(profile);
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl text-stone-900">Debate history</h2>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">No concluded debates yet.</p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {history.map((debate) => (
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
