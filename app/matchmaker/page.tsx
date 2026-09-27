import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  getIdeologicalMatches,
  type IdeologicalMatch,
} from "@/lib/actions/matchmaker";
import { createServerSupabase, getServerUser } from "@/lib/db/supabase-server";

export const metadata: Metadata = {
  title: "Matchmaker · WHERE 2 RUN",
  description: "Candidates ranked by ideological alignment with your stance vector.",
};

export default async function MatchmakerPage() {
  const user = await getServerUser();

  if (!user) {
    return (
      <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
          <header>
            <h1 className="font-display text-3xl font-semibold tracking-[0.18em] text-parchment">
              YOUR MATCHES
            </h1>
          </header>
          <div className="mt-10 rounded-xl border border-gold/50 bg-zinc-900 px-5 py-5">
            <p className="text-sm leading-6 text-parchment">
              Sign in to find your matches
            </p>
            <Link
              href="/auth/login"
              className="mt-3 inline-block text-[11px] font-medium uppercase tracking-widest text-gold hover:text-parchment"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const supabase = await createServerSupabase();
  const { data: profile, error: stanceError } = await supabase
    .from("users")
    .select("stance_vector, target_district_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!stanceError && (profile == null || profile.target_district_id == null)) {
    return (
      <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
          <Link
            href="/onboarding/district"
            className="block w-full rounded-xl border border-gold bg-zinc-900 px-6 py-8 shadow-[inset_3px_0_0_0_var(--gold-strong)] transition-colors hover:border-gold hover:bg-zinc-900/80"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
              Verify district
            </p>
            <p className="mt-3 font-display text-2xl font-semibold leading-snug tracking-tight text-parchment">
              Welcome! To unlock your live civic feed and voter matchmaking, please verify your
              local district.
            </p>
          </Link>
        </div>
      </main>
    );
  }

  const stanceVector = stanceError ? undefined : (profile?.stance_vector ?? null);
  if (stanceVector === null) {
    return (
      <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
          <Link
            href="/onboarding/stance"
            className="block w-full rounded-xl border border-gold bg-zinc-900 px-6 py-8 shadow-[inset_3px_0_0_0_var(--gold-strong)] transition-colors hover:border-gold hover:bg-zinc-900/80"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
              Stance Quiz
            </p>
            <p className="mt-3 font-display text-2xl font-semibold leading-snug tracking-tight text-parchment">
              Discover your ideological matches. Complete the 2-minute Stance Quiz to instantly
              see which local candidates align with your values.
            </p>
          </Link>
        </div>
      </main>
    );
  }

  let matches: IdeologicalMatch[] = [];
  let errorMessage: string | null = null;

  try {
    matches = await getIdeologicalMatches();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Could not load matches.";
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-[0.18em] text-parchment">
            YOUR MATCHES
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Candidates closest to your stance vector, ranked by alignment.
          </p>
        </header>

        {errorMessage ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">{errorMessage}</p>
        ) : matches.length === 0 ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            No matches yet. File a stance so the matchmaker can score candidates.
          </p>
        ) : (
          <ol className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {matches.map((candidate, index) => (
              <li key={candidate.id}>
                <Link href={`/candidate/${candidate.id}`} className="group block h-full">
                  <Card className="h-full transition-all group-hover:border-zinc-500">
                    <CardContent className="flex items-center gap-4 px-5 py-5">
                      <span className="w-10 shrink-0 font-display text-lg tabular-nums text-gold">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-parchment">
                          {candidate.name}
                        </span>
                        <span className="mt-1 block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                          {candidate.elo} ELO
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-display text-lg tabular-nums text-gold">
                          {candidate.alignmentScore}%
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                          Alignment Score
                        </span>
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
