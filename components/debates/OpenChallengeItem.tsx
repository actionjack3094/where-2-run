import Link from "next/link";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import type { OpenChallenge } from "@/lib/debates/action-queue";

const CTA =
  "mt-4 inline-flex rounded-md bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-700";

export function OpenChallengeItem({ challenge }: { challenge: OpenChallenge }) {
  return (
    <article className="mb-4 rounded-2xl border border-amber-200/70 bg-white p-6 shadow-sm">
      <header className="flex items-center gap-3">
        <CandidateAvatar name={challenge.authorName} size="sm" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-stone-900">{challenge.authorName}</p>
            <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-800">
              {challenge.authorStatus}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-stone-500">
            {challenge.party} · {challenge.office}
          </p>
        </div>
      </header>
      <p className="mt-4 text-sm leading-6 text-stone-800">{challenge.stance}</p>
      <Link href={`/debates/${challenge.id}`} className={CTA}>
        Accept the clash
      </Link>
    </article>
  );
}
