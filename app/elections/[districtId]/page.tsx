import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isUuid } from "@/lib/arena/display";
import { createServerSupabase as createClient } from "@/lib/db/supabase-server";
import { SIX_AXIS_IDS, SIX_AXIS_LABELS, type SixAxisId } from "@/lib/ideology/six-axis";

type ElectionDetails = {
  id: string;
  office_name: string;
  slug: string;
  district_id: string | null;
};

type DebateQuestion = {
  id: string;
  prompt: string;
  jurisdictional_level: string;
  primary_axis: string;
  information_gain_score: number | string;
};

type DistrictHub = {
  election: ElectionDetails | null;
  questions: DebateQuestion[];
  error: string | null;
};

type ElectionHubPageProps = {
  params: Promise<{ districtId: string }>;
};

function axisLabel(axis: string) {
  if ((SIX_AXIS_IDS as readonly string[]).includes(axis)) {
    return SIX_AXIS_LABELS[axis as SixAxisId];
  }
  return axis;
}

function gainLabel(score: number | string) {
  const value = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

const loadDistrictHub = cache(async (districtId: string): Promise<DistrictHub> => {
  const supabase = await createClient();
  const electionQuery = supabase
    .from("elections")
    .select("id, office_name, slug, district_id")
    .limit(1);

  const { data: election, error: electionError } = await (
    isUuid(districtId)
      ? electionQuery.or(`id.eq.${districtId},district_id.eq.${districtId}`)
      : electionQuery.eq("slug", districtId)
  ).maybeSingle();

  if (electionError) {
    return { election: null, questions: [], error: electionError.message };
  }

  const details = (election as ElectionDetails | null) ?? null;
  if (!details) return { election: null, questions: [], error: null };

  const { data: questions, error: questionsError } = await supabase
    .from("election_questions")
    .select("id, prompt, jurisdictional_level, primary_axis, information_gain_score")
    .eq("election_id", details.id)
    .order("information_gain_score", { ascending: false })
    .order("created_at", { ascending: false });

  if (questionsError) {
    return { election: details, questions: [], error: questionsError.message };
  }

  return {
    election: details,
    questions: (questions ?? []) as DebateQuestion[],
    error: null,
  };
});

export async function generateMetadata({
  params,
}: ElectionHubPageProps): Promise<Metadata> {
  const { districtId } = await params;
  const { election } = await loadDistrictHub(districtId);
  const title = election?.office_name;

  return {
    title: title ? `${title} · WHERE 2 RUN` : "Election · WHERE 2 RUN",
    description: title
      ? `Debate questions for ${title}.`
      : "Debate questions for this election.",
  };
}

export default async function ElectionHubPage({ params }: ElectionHubPageProps) {
  const { districtId } = await params;
  const { election, questions, error } = await loadDistrictHub(districtId);

  if (error && !election) {
    return (
      <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10 pb-16">
          <p className="mt-8 text-sm leading-6 text-zinc-400">
            Could not load this election. {error}
          </p>
        </div>
      </main>
    );
  }

  if (!election) {
    notFound();
  }

  const title = election.office_name;

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
            Election
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold uppercase tracking-tight text-parchment sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Debate questions banked for this race. Open a question to answer it.
          </p>
          <Link
            href={`/elections/${election.slug}/profile`}
            className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-widest text-gold hover:text-parchment"
          >
            Race profile
          </Link>
        </header>

        {error ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            Could not load debate questions. {error}
          </p>
        ) : questions.length === 0 ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            No debate questions are banked for this election yet.
          </p>
        ) : (
          <ul className="mt-10 grid list-none gap-4 sm:grid-cols-2">
            {questions.map((question) => (
              <li key={question.id}>
                <Link
                  href={`/elections/${districtId}/${question.id}`}
                  className="block h-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  <Card className="h-full transition-colors hover:border-gold">
                    <CardHeader>
                      <CardDescription className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                        {question.jurisdictional_level} · {axisLabel(question.primary_axis)}
                      </CardDescription>
                      <CardTitle className="text-base leading-snug text-parchment">
                        {question.prompt}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                        Information gain {gainLabel(question.information_gain_score)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
