import Link from "next/link";
import { ChallengeForm } from "@/components/platform/ArenaForms";
import type { ArenaCard } from "@/lib/platform/types";

function uniqueSeats(seats: ArenaCard[]) {
  const seen = new Set<string>();
  return seats.filter((seat) => {
    const key = `${seat.prompt}|${seat.stanceA}|${seat.sideA.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function PrimarySeats({
  seats,
  canPost,
  closed,
  userId,
  slug,
  signedIn,
}: {
  seats: ArenaCard[];
  canPost: boolean;
  closed: boolean;
  userId: string | null;
  slug: string;
  signedIn: boolean;
}) {
  const open = uniqueSeats(seats);
  return (
    <>
      <section className="mt-10">
        <h2 className="font-display text-xl text-stone-900">Open questions</h2>
        <div className="mt-4 grid gap-4">
          {open.map((seat) => (
            <article key={seat.id} className="rounded-xl border border-amber-500/30 px-4 py-4">
              <h3 className="text-sm font-medium text-stone-900">{seat.prompt}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{seat.stanceA}</p>
              <p className="mt-2 text-[11px] uppercase tracking-widest text-stone-600">
                <Link href={`/profile/${seat.sideA.id}`} className="hover:text-amber-800">
                  {seat.sideA.name}
                </Link>
              </p>
              {canPost && !closed && userId !== seat.sideA.id ? (
                <div className="mt-4">
                  <ChallengeForm debateId={seat.id} />
                </div>
              ) : null}
            </article>
          ))}
          {open.length === 0 ? <p className="text-sm text-stone-600">No open seats in this primary.</p> : null}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="font-display text-xl text-stone-900">Post a question</h2>
        {closed ? (
          <p className="mt-3 text-sm leading-6 text-stone-600">Debates are permanently locked.</p>
        ) : canPost ? (
          <Link
            href={`/debates/create?primary=${slug}`}
            className="mt-4 inline-flex rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-900"
          >
            Create challenge
          </Link>
        ) : (
          <p className="mt-3 text-sm leading-6 text-stone-600">
            {signedIn ? (
              <>
                Finish the <Link href="/onboarding/ideology" className="text-amber-800">diagnostic</Link> and stay inside this party to post.
              </>
            ) : (
              <>
                <Link href="/auth/login" className="text-amber-800">Sign in</Link> to post a question.
              </>
            )}
          </p>
        )}
      </section>
    </>
  );
}
