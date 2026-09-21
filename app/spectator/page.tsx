import { createServerClient } from "@supabase/auth-helpers-nextjs";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { PledgeEscrowButton } from "@/components/pledges/PledgeEscrowButton";
import { formatElectability, toNumber } from "@/lib/electability";
import { formatUsd, GRASSROOTS_THRESHOLD, parseAmount } from "@/lib/pledges";
import type { ElectabilityScore, Pledge, UserProfile } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Donor Feed · WHERE 2 RUN",
  description:
    "Pledge escrow behind candidates racing to a $5,000 grassroots campaign goal.",
};

type DonorCandidate = {
  id: string;
  username: string;
  electability: number;
  pledged: number;
};

async function createSupabase() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot persist refreshed auth cookies.
        }
      },
    },
  });
}

async function loadDonorFeed(): Promise<{
  candidates: DonorCandidate[];
  error: string | null;
}> {
  const supabase = await createSupabase();

  const [
    { data: userRows, error: userError },
    { data: pledgeRows, error: pledgeError },
    { data: scoreRows, error: scoreError },
  ] = await Promise.all([
    supabase.from("users").select("id, username"),
    supabase.from("pledges").select("candidate_id, amount"),
    supabase.from("electability_scores").select("user_id, electability_multiplier"),
  ]);

  if (userError) {
    return { candidates: [], error: userError.message };
  }
  if (pledgeError) {
    return { candidates: [], error: pledgeError.message };
  }
  if (scoreError) {
    return { candidates: [], error: scoreError.message };
  }

  const pledgedByCandidate = new Map<string, number>();
  for (const row of (pledgeRows ?? []) as Pick<Pledge, "candidate_id" | "amount">[]) {
    pledgedByCandidate.set(
      row.candidate_id,
      (pledgedByCandidate.get(row.candidate_id) ?? 0) + parseAmount(row.amount),
    );
  }

  const electabilityByUser = new Map<string, number>();
  for (const row of (scoreRows ?? []) as Pick<
    ElectabilityScore,
    "user_id" | "electability_multiplier"
  >[]) {
    const current = electabilityByUser.get(row.user_id) ?? 0;
    const next = toNumber(row.electability_multiplier);
    if (next > current) electabilityByUser.set(row.user_id, next);
  }

  const candidates = ((userRows ?? []) as Pick<UserProfile, "id" | "username">[])
    .map((user) => ({
      id: user.id,
      username: user.username,
      electability: electabilityByUser.get(user.id) ?? 0,
      pledged: pledgedByCandidate.get(user.id) ?? 0,
    }))
    .sort((left, right) => {
      if (right.electability !== left.electability) {
        return right.electability - left.electability;
      }
      if (right.pledged !== left.pledged) return right.pledged - left.pledged;
      return left.username.localeCompare(right.username);
    });

  return { candidates, error: null };
}

export default async function SpectatorPage() {
  const { candidates, error } = await loadDonorFeed();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Donor Feed
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
              Escrow Pledges
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Back a candidate with a $50 escrow pledge. Campaigns clear the board at{" "}
              {formatUsd(GRASSROOTS_THRESHOLD)}.
            </p>
          </div>
          <Link
            href="/leaderboards"
            className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 px-3 text-xs font-medium uppercase tracking-widest text-zinc-100 transition-colors hover:bg-zinc-700"
          >
            Leaderboards
          </Link>
        </header>

        {error ? (
          <p className="mt-16 text-sm leading-6 text-zinc-400">
            Could not load the donor feed. {error}
          </p>
        ) : candidates.length === 0 ? (
          <p className="mt-16 text-sm leading-6 text-zinc-400">
            No candidates on the ticket yet. Take a stance or win a debate to appear
            here.
          </p>
        ) : (
          <section className="mt-10 flex flex-col gap-4">
            {candidates.map((candidate) => (
              <CandidateCard key={candidate.id} candidate={candidate} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function CandidateCard({ candidate }: { candidate: DonorCandidate }) {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <Link
              href={`/candidate/${candidate.id}`}
              className="text-lg font-semibold leading-snug tracking-tight text-zinc-100 transition-colors hover:text-zinc-300"
            >
              {candidate.username}
            </Link>
            <p className="shrink-0 font-mono text-xs font-medium uppercase text-blue-400">
              {formatElectability(candidate.electability)} electability
            </p>
          </div>
          <FundingProgress pledged={candidate.pledged} />
        </div>
        <PledgeEscrowButton
          candidateId={candidate.id}
          candidateName={candidate.username}
        />
      </div>
    </article>
  );
}

function FundingProgress({ pledged }: { pledged: number }) {
  const rawPercent = (pledged / GRASSROOTS_THRESHOLD) * 100;
  const percentLabel =
    pledged > 0 && rawPercent < 1 ? rawPercent.toFixed(1) : `${Math.round(rawPercent)}`;
  const remaining = Math.max(0, GRASSROOTS_THRESHOLD - pledged);
  const cleared = pledged >= GRASSROOTS_THRESHOLD;
  const barWidth = cleared ? 100 : pledged > 0 ? Math.max(rawPercent, 1.5) : 0;

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium tabular-nums text-zinc-100">
          {formatUsd(pledged)} pledged
        </p>
        <p className="text-xs tabular-nums text-zinc-500">
          {cleared
            ? "Goal cleared"
            : `${formatUsd(remaining)} to go toward ${formatUsd(GRASSROOTS_THRESHOLD)}`}
        </p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={GRASSROOTS_THRESHOLD}
        aria-valuenow={Math.min(pledged, GRASSROOTS_THRESHOLD)}
        aria-label="Campaign funding progress"
      >
        <div
          className="h-full bg-zinc-100 transition-all duration-500"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <p className="mt-2 text-xs tabular-nums text-zinc-500">{percentLabel}%</p>
    </div>
  );
}
