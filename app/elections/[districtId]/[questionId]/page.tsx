import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  ChallengeOpponentButton,
  TakeStanceButton,
} from "@/app/elections/[districtId]/[questionId]/floor-controls";
import { isUuid } from "@/lib/arena/display";
import { createServerSupabase as createClient } from "@/lib/db/supabase-server";

type QuestionDetails = {
  id: string;
  prompt: string;
  jurisdictional_level: string;
  primary_axis: string;
  election_id: string;
  elections:
    | { id: string; district_id: string | null; slug: string }
    | { id: string; district_id: string | null; slug: string }[]
    | null;
};

type OwnDebate = {
  id: string;
  status: string;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
};

type OpponentUser = {
  id: string;
  username: string;
  viability_score: number | string;
  target_district_id: string | null;
};

type OpponentRow = {
  id: string;
  candidate_a_id: string | null;
  candidate_a: OpponentUser | OpponentUser[] | null;
};

type QuestionPageProps = {
  params: Promise<{ districtId: string; questionId: string }>;
};

type QuestionPageData = {
  question: QuestionDetails | null;
  ownDebate: OwnDebate | null;
  opponents: { debateId: string; username: string; viabilityScore: number; rank: number }[];
  error: string | null;
  stanceError: string | null;
  opponentError: string | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function viabilityScore(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function localizedDistrictId(districtId: string, question: QuestionDetails) {
  const election = unwrapOne(question.elections);
  if (!election?.district_id) return districtId;
  if (
    districtId === election.district_id ||
    districtId === election.id ||
    districtId === election.slug
  ) {
    return election.district_id;
  }
  return districtId;
}

const loadQuestionPage = cache(async (
  districtId: string,
  questionId: string,
): Promise<QuestionPageData> => {
  const empty: QuestionPageData = {
    question: null,
    ownDebate: null,
    opponents: [],
    error: null,
    stanceError: null,
    opponentError: null,
  };
  if (!isUuid(questionId)) return empty;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const questionQuery = supabase
    .from("election_questions")
    .select(
      "id, prompt, jurisdictional_level, primary_axis, election_id, elections(id, district_id, slug)",
    )
    .eq("id", questionId)
    .maybeSingle();

  const ownDebateQuery = userId
    ? supabase
        .from("debates")
        .select("id, status, candidate_a_id, candidate_b_id")
        .eq("election_question_id", questionId)
        .or(`candidate_a_id.eq.${userId},candidate_b_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [questionResult, ownDebateResult] = await Promise.all([
    questionQuery,
    ownDebateQuery,
  ]);

  if (questionResult.error) {
    return { ...empty, error: questionResult.error.message };
  }
  const question = (questionResult.data as QuestionDetails | null) ?? null;
  if (!question) return empty;

  const district = localizedDistrictId(districtId, question);
  let opponentsQuery = supabase
    .from("debates")
    .select(
      `
      id,
      candidate_a_id,
      candidate_a:users!debates_candidate_a_id_fkey!inner (
        id,
        username,
        viability_score,
        target_district_id
      )
    `,
    )
    .eq("election_question_id", questionId)
    .eq("status", "waiting")
    .eq("candidate_a.target_district_id", district)
    .order("candidate_a(viability_score)", { ascending: false });

  if (userId) {
    opponentsQuery = opponentsQuery.neq("candidate_a_id", userId);
  }

  const opponentsResult = await opponentsQuery;
  const stanceError = ownDebateResult.error?.message ?? null;
  const opponentError = opponentsResult.error?.message ?? null;
  if (opponentError) {
    return {
      question,
      ownDebate: stanceError ? null : ((ownDebateResult.data as OwnDebate | null) ?? null),
      opponents: [],
      error: null,
      stanceError,
      opponentError,
    };
  }

  const opponents = ((opponentsResult.data ?? []) as OpponentRow[])
    .map((row) => {
      const opponent = unwrapOne(row.candidate_a);
      if (!opponent || opponent.target_district_id !== district) return null;
      if (userId && opponent.id === userId) return null;
      return {
        debateId: row.id,
        username: opponent.username,
        viabilityScore: viabilityScore(opponent.viability_score),
      };
    })
    .filter((row): row is { debateId: string; username: string; viabilityScore: number } =>
      Boolean(row),
    )
    .sort((left, right) => right.viabilityScore - left.viabilityScore)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    question,
    ownDebate: stanceError ? null : ((ownDebateResult.data as OwnDebate | null) ?? null),
    opponents,
    error: null,
    stanceError,
    opponentError: null,
  };
});

export async function generateMetadata({ params }: QuestionPageProps): Promise<Metadata> {
  const { districtId, questionId } = await params;
  const { question } = await loadQuestionPage(districtId, questionId);
  const prompt = question?.prompt;

  return {
    title: prompt ? `${prompt} · WHERE 2 RUN` : "Debate question · WHERE 2 RUN",
    description: prompt ?? "Take a stance and challenge a waiting opponent.",
  };
}

export default async function DebateQuestionPage({ params }: QuestionPageProps) {
  const { districtId, questionId } = await params;
  const { question, ownDebate, opponents, error, stanceError, opponentError } =
    await loadQuestionPage(districtId, questionId);

  if (error && !question) {
    return (
      <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
          <p className="mt-8 text-sm leading-6 text-zinc-400">
            Could not load this question. {error}
          </p>
        </div>
      </main>
    );
  }

  if (!question) {
    notFound();
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
            Debate question
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-parchment sm:text-4xl">
            {question.prompt}
          </h1>
          <Link
            href={`/elections/${districtId}`}
            className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-widest text-gold hover:text-parchment"
          >
            All questions
          </Link>
        </header>

        {ownDebate ? (
          <div className="mt-8 rounded-xl border border-gold/50 bg-zinc-900 px-5 py-4">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-gold">
              Stance Recorded / You have the floor
            </p>
          </div>
        ) : stanceError ? (
          <p className="mt-8 text-sm leading-6 text-zinc-400">
            Could not check whether you already have the floor. {stanceError}
          </p>
        ) : (
          <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
            <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              Take a stance
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Record your stance to enter this question as candidate A and open the floor.
            </p>
            <TakeStanceButton questionId={question.id} />
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
            Waiting opponents
          </h2>
          {opponentError ? (
            <p className="mt-4 text-sm leading-6 text-zinc-400">
              Could not load opponents in this district. {opponentError}
            </p>
          ) : opponents.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-zinc-400">
              No opponents are waiting on this question in this district.
            </p>
          ) : (
            <ul className="mt-4 flex max-h-[36rem] list-none flex-col gap-3 overflow-y-auto pr-1">
              {opponents.map((opponent) => (
                <li
                  key={opponent.debateId}
                  className="flex flex-col gap-4 rounded-xl border border-red-500/40 bg-zinc-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      Viability rank {opponent.rank}
                    </p>
                    <p className="mt-2 text-base font-semibold text-parchment">
                      {opponent.username}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      Viability {opponent.viabilityScore}
                    </p>
                  </div>
                  <ChallengeOpponentButton
                    questionId={question.id}
                    debateId={opponent.debateId}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
