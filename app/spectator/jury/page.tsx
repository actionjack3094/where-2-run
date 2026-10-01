import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getServerUser } from "@/lib/db/supabase-server";
import { getPendingAppealsForUser } from "@/lib/queries/jury-feed";

export const metadata: Metadata = {
  title: "Jury Duty · WHERE 2 RUN",
  description: "Pending local appeals that verified constituents can still review.",
};

export default async function JuryDutyPage() {
  const user = await getServerUser();
  const cases = user ? await getPendingAppealsForUser() : [];

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
            Spectator jury
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-parchment">
            Jury Duty
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Pending appeals in your verified districts. Review the transcript, then
            overturn or sustain the recorded winner.
          </p>
        </header>

        {!user ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            <Link href="/auth/login" className="text-gold hover:text-parchment">
              Sign in
            </Link>{" "}
            as a verified constituent to serve on a local jury.
          </p>
        ) : cases.length === 0 ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            No active cases in your district.
          </p>
        ) : (
          <ul className="mt-10 flex flex-col gap-4">
            {cases.map((item) => (
              <li key={item.id}>
                <article className="rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
                  <h2 className="font-display text-lg font-semibold leading-snug tracking-tight text-parchment">
                    {item.topic}
                  </h2>
                  <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                    {item.reason}
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                      {item.verdicts} of {item.quorum} Jurors Reached
                    </p>
                    <Button asChild variant="gold" size="sm">
                      <Link href={`/spectator/jury/${item.id}`}>Review Case</Link>
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
