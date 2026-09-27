import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CountdownTimer } from "@/app/components/countdown-timer";
import { RealtimeDebateListener } from "@/app/components/realtime-debate-listener";
import { resolveDebate } from "@/lib/actions/debate-resolution";
import { isUuid } from "@/lib/arena/display";
import { loadDebateComments } from "@/lib/comments";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { submitArgument } from "./actions";
import { DebateView } from "./debate-view";
import { SpectatorBallot } from "./spectator-ballot";

type ActiveDebatePageProps = {
  params: Promise<{ debateId: string }>;
};

type DebateRow = {
  id: string;
  topic: string;
  status: string;
  expires_at: string | null;
  election_question_id: string | null;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
  candidate_a_argument: string | null;
  candidate_b_argument: string | null;
  winner_id: string | null;
  candidate_a_votes: number;
  candidate_b_votes: number;
};

export const metadata: Metadata = {
  title: "Active Debate · WHERE 2 RUN",
  description: "The live floor for an accepted challenge.",
};

function statusLabel(status: string) {
  if (!status) return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function concludedOutcome(debate: DebateRow) {
  if (debate.winner_id && debate.winner_id === debate.candidate_a_id) {
    return "Candidate A is the winner";
  }
  if (debate.winner_id && debate.winner_id === debate.candidate_b_id) {
    return "Candidate B is the winner";
  }
  return "Tie";
}

export default async function ActiveDebatePage({ params }: ActiveDebatePageProps) {
  const { debateId } = await params;
  if (!isUuid(debateId)) notFound();

  const supabase = await createServerSupabase();
  const debateColumns =
    "id, topic, status, expires_at, election_question_id, candidate_a_id, candidate_b_id, candidate_a_argument, candidate_b_argument, winner_id, candidate_a_votes, candidate_b_votes";
  let { data, error } = await supabase
    .from("debates")
    .select(debateColumns)
    .eq("id", debateId)
    .maybeSingle();

  if (
    error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      /candidate_[ab]_argument/i.test(error.message ?? ""))
  ) {
    const fallback = await supabase
      .from("debates")
      .select(
        "id, topic, status, expires_at, election_question_id, candidate_a_id, candidate_b_id",
      )
      .eq("id", debateId)
      .maybeSingle();
    data = fallback.data
      ? {
          ...fallback.data,
          candidate_a_argument: null,
          candidate_b_argument: null,
          winner_id: null,
          candidate_a_votes: 0,
          candidate_b_votes: 0,
        }
      : null;
    error = fallback.error;
  }

  if (error || !data) notFound();
  let debate = data as DebateRow;

  if (
    debate.status === "voting" &&
    debate.expires_at != null &&
    new Date(debate.expires_at) <= new Date()
  ) {
    await resolveDebate(debate.id);
    const refreshed = await supabase
      .from("debates")
      .select(debateColumns)
      .eq("id", debate.id)
      .maybeSingle();

    if (refreshed.error || !refreshed.data) notFound();
    debate = refreshed.data as DebateRow;
  }

  let prompt = debate.topic.trim();
  if (debate.election_question_id) {
    const { data: question } = await supabase
      .from("election_questions")
      .select("prompt")
      .eq("id", debate.election_question_id)
      .maybeSingle();
    const questionPrompt = (question as { prompt?: string } | null)?.prompt?.trim();
    if (questionPrompt) prompt = questionPrompt;
  }

  const comments = await loadDebateComments(debateId);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isCandidateA = user?.id != null && user.id === debate.candidate_a_id;
  const isCandidateB = user?.id != null && user.id === debate.candidate_b_id;
  const isCandidateATurn = debate.candidate_a_argument === null;
  const isCandidateBTurn =
    debate.candidate_a_argument !== null && debate.candidate_b_argument === null;
  const isMyTurn =
    (isCandidateA && isCandidateATurn) || (isCandidateB && isCandidateBTurn);
  const isSeatedCandidate = isCandidateA || isCandidateB;

  const candidateAId = debate.candidate_a_id;
  const candidateBId = debate.candidate_b_id;
  const isCompleted = debate.status === "completed";
  const ballotOpen = debate.status === "voting" && Boolean(candidateAId && candidateBId);

  let aVotes = 0;
  let bVotes = 0;
  let votedCandidateId: string | null = null;

  if (ballotOpen && candidateAId && candidateBId) {
    const [aCount, bCount, ownVote] = await Promise.all([
      supabase
        .from("votes")
        .select("id", { count: "exact", head: true })
        .eq("debate_id", debateId)
        .eq("candidate_id", candidateAId),
      supabase
        .from("votes")
        .select("id", { count: "exact", head: true })
        .eq("debate_id", debateId)
        .eq("candidate_id", candidateBId),
      user
        ? supabase
            .from("votes")
            .select("candidate_id")
            .eq("debate_id", debateId)
            .eq("voter_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (aCount.error) throw new Error(aCount.error.message);
    if (bCount.error) throw new Error(bCount.error.message);
    if (ownVote.error) throw new Error(ownVote.error.message);

    aVotes = aCount.count ?? 0;
    bVotes = bCount.count ?? 0;
    votedCandidateId =
      (ownVote.data as { candidate_id: string } | null)?.candidate_id ?? null;
  }

  const hasVoted = votedCandidateId !== null;
  const totalVotes = aVotes + bVotes;
  const aShare = totalVotes === 0 ? 0 : Math.round((aVotes / totalVotes) * 100);
  const bShare = totalVotes === 0 ? 0 : 100 - aShare;

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <RealtimeDebateListener debateId={debateId} />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            {isCompleted ? "Completed debate" : "Active debate"}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-parchment">
            {prompt || "Untitled question"}
          </h1>
        </header>

        <section
          aria-label="Debate status"
          className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gold/50 bg-zinc-900 px-5 py-4"
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Status
            </p>
            <p className="mt-1 text-sm font-medium text-gold">{statusLabel(debate.status)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              24-hour expiration
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums text-parchment">
              <CountdownTimer expiresAt={debate.expires_at ?? ""} />
            </p>
          </div>
        </section>

        <section aria-label="Argument stage" className="mt-8">
          {isCompleted ? (
            <div className="flex flex-col gap-4">
              <div
                role="status"
                className="rounded-xl border-2 border-gold bg-gold/10 px-6 py-6 text-center"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold">
                  Debate Concluded
                </p>
                <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
                  {concludedOutcome(debate)}
                </p>
              </div>
              <div className="flex h-[60vh] flex-col gap-4 overflow-y-auto">
                <article className="rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                    Candidate A
                  </p>
                  <h3 className="mt-2 text-sm font-medium text-parchment">Stance</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {debate.candidate_a_argument?.trim() || "Opening stance will appear here."}
                  </p>
                  <p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight text-parchment">
                    {debate.candidate_a_votes}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {debate.candidate_a_votes === 1 ? "vote" : "votes"}
                  </p>
                </article>
                <article className="rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-5">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                    Candidate B
                  </p>
                  <h3 className="mt-2 text-sm font-medium text-parchment">Counter-stance</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {debate.candidate_b_argument?.trim() || "Counter-stance will appear here."}
                  </p>
                  <p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight text-parchment">
                    {debate.candidate_b_votes}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {debate.candidate_b_votes === 1 ? "vote" : "votes"}
                  </p>
                </article>
              </div>
            </div>
          ) : debate.status === "voting" ? (
            <div className="flex flex-col gap-4">
              <p
                role="status"
                className="rounded-xl border border-gold/40 bg-zinc-900 px-5 py-4 text-sm font-medium text-gold"
              >
                Voting is now open
              </p>
              {ballotOpen && candidateAId && candidateBId && !isSeatedCandidate ? (
                <SpectatorBallot
                  debateId={debateId}
                  candidateAId={candidateAId}
                  candidateBId={candidateBId}
                  hasVoted={hasVoted}
                  votedCandidateId={votedCandidateId}
                  aVotes={aVotes}
                  bVotes={bVotes}
                  aShare={aShare}
                  bShare={bShare}
                />
              ) : null}
            </div>
          ) : (
            <>
              <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Argument stage
              </h2>
              <div className="mt-4 flex h-[60vh] flex-col gap-4 overflow-y-auto">
                <article className="rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                    Candidate A
                  </p>
                  <h3 className="mt-2 text-sm font-medium text-parchment">Stance</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {debate.candidate_a_argument?.trim() || "Opening stance will appear here."}
                  </p>
                </article>
                <article className="rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-5">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                    Candidate B
                  </p>
                  <h3 className="mt-2 text-sm font-medium text-parchment">Counter-stance</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {debate.candidate_b_argument?.trim() || "Counter-stance will appear here."}
                  </p>
                </article>
              </div>

              {isMyTurn ? (
                <form
                  action={submitArgument.bind(null, debateId)}
                  className="mt-4 rounded-xl border border-dashed border-gold/40 bg-zinc-950 px-5 py-5"
                >
                  <label htmlFor="argument-draft" className="text-sm font-medium text-parchment">
                    Submit an argument
                  </label>
                  <textarea
                    id="argument-draft"
                    name="argument"
                    rows={4}
                    placeholder="Write your argument…"
                    className="mt-3 w-full resize-y rounded-md border border-gold/40 bg-zinc-950 px-4 py-3 text-sm text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60"
                  />
                  <button
                    type="submit"
                    className="mt-3 rounded-md border border-gold/50 px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-gold transition-colors duration-200 hover:bg-zinc-800"
                  >
                    Submit argument
                  </button>
                </form>
              ) : isSeatedCandidate ? (
                <p
                  role="status"
                  className="mt-4 rounded-xl border border-gold/40 bg-zinc-900 px-5 py-4 text-sm font-medium text-gold"
                >
                  Waiting for opponent&apos;s response...
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>

      <DebateView
        debateId={debateId}
        comments={comments}
        votingOpen={debate.status === "voting"}
      />
    </main>
  );
}
