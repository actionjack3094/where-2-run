import Link from "next/link";
import { notFound } from "next/navigation";
import { RoundTranscript } from "@/components/debates/RoundTranscript";
import { TownHall } from "@/components/platform/TownHall";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { formatOfficeTag } from "@/lib/debates/clash-feed";
import { roundPairs, type ArgumentRow } from "@/lib/debates/round-state";
import { loadTownHalls } from "@/lib/platform/town-hall";
import { displayName, loadProfile, loadProfiles, platformAdmin } from "@/lib/platform/records";

/**
 * Transcript and constituent Q&A for an arena debate that is not on the legacy floor.
 */
export async function ArenaDebateRoom({ debateId }: { debateId: string }) {
  if (!isUuid(debateId)) notFound();

  const admin = platformAdmin();
  const debateResult = await admin
    .from("arena_debates")
    .select("id, primary_id, prompt_id, candidate_a_id, candidate_b_id, stance_a, stance_b, status, exchange_round")
    .eq("id", debateId)
    .maybeSingle();
  if (debateResult.error || !debateResult.data) notFound();

  const debate = debateResult.data as {
    id: string;
    primary_id: string;
    prompt_id: string;
    candidate_a_id: string;
    candidate_b_id: string | null;
    stance_a: string;
    stance_b: string | null;
    status: string;
    exchange_round: number | null;
  };

  const [promptResult, primaryResult, argumentResult, profiles, halls, user] = await Promise.all([
    admin.from("debate_prompts").select("prompt_text").eq("id", debate.prompt_id).maybeSingle(),
    admin.from("primaries").select("office_name, state").eq("id", debate.primary_id).maybeSingle(),
    admin
      .from("arguments")
      .select("author_id, round_number, content")
      .eq("debate_id", debateId)
      .order("round_number", { ascending: true }),
    loadProfiles(admin, [debate.candidate_a_id, debate.candidate_b_id ?? ""]),
    loadTownHalls([debateId]).catch(() => new Map()),
    getServerUser(),
  ]);

  const prompt =
    (!promptResult.error && (promptResult.data as { prompt_text?: string } | null)?.prompt_text?.trim()) ||
    "Open question";
  const primary = primaryResult.error ? null : (primaryResult.data as { office_name?: string; state?: string } | null);
  const office = formatOfficeTag(primary?.office_name ?? "Primary", primary?.state ?? "");
  const argumentRows = (
    argumentResult.error || isMissingSchema(argumentResult.error) ? [] : (argumentResult.data ?? [])
  ) as ArgumentRow[];
  const rounds = roundPairs(argumentRows, {
    candidate_a_id: debate.candidate_a_id,
    candidate_b_id: debate.candidate_b_id,
    current_round: debate.exchange_round ?? 1,
    candidate_a_argument: debate.stance_a,
    candidate_b_argument: debate.stance_b,
  });
  const sideA = displayName(profiles.get(debate.candidate_a_id) ?? null);
  const sideB = debate.candidate_b_id ? displayName(profiles.get(debate.candidate_b_id) ?? null) : "Candidate B";

  let verified = false;
  if (user?.id) {
    const profile = await loadProfile(admin, user.id).catch(() => null);
    verified = profile?.is_verified === true;
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-500">{office}</p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-stone-900">
          {prompt}
        </h1>
        <p className="mt-3 text-sm text-stone-600">
          <Link href="/debates" className="text-amber-800">
            Debates
          </Link>
        </p>

        <section aria-label="Argument stage" className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">Full rounds</h2>
          <div className="mt-4">
            <RoundTranscript
              rounds={rounds}
              candidateAName={sideA}
              candidateBName={sideB}
              activeRound={debate.exchange_round ?? undefined}
            />
          </div>
        </section>

        <div id="questions">
          <TownHall
            debateId={debateId}
            questions={halls.get(debateId) ?? []}
            viewerId={user?.id ?? null}
            verified={verified}
            candidateAId={debate.candidate_a_id}
            candidateBId={debate.candidate_b_id}
          />
        </div>
      </div>
    </main>
  );
}
