import type { Metadata } from "next";
import Link from "next/link";
import { ElectionRaceHub } from "@/app/elections/[state]/race-hub";
import { IdeologyCompass, compassFromPlane } from "@/components/IdeologyCompass";
import { DISTRICT_AGENDA_TIP, IDEOLOGY_VECTOR_TIP, InfoTooltip } from "@/components/InfoTooltip";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { resolveStateParam } from "@/lib/platform/states";
import { partyLabel } from "@/lib/platform/types";
import { cn } from "@/lib/utils";
import type { Candidate, Primary, PrimaryQuestion } from "@/types/database.types";

export const dynamic = "force-dynamic";

type StatePageProps = {
  params: Promise<{ state: string }>;
  searchParams: Promise<{ tab?: string }>;
};

type AgendaRow = {
  id: string;
  primary_id: string;
  title: string;
  content: string;
  upvote_count: number;
};

type IdeologicalVector = { x: number; y: number };

function parseVector(value: Candidate["ideological_vector"]): IdeologicalVector | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = typeof record.x === "number" ? record.x : Number(record.x);
  const y = typeof record.y === "number" ? record.y : Number(record.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function formatVector(vector: IdeologicalVector | null) {
  if (!vector) return "—";
  return `(${vector.x.toFixed(2)}, ${vector.y.toFixed(2)})`;
}

export async function generateMetadata(props: StatePageProps): Promise<Metadata> {
  const { state: raw } = await props.params;
  const match = resolveStateParam(raw);
  if (match) return { title: `${match.name} elections · WHERE 2 RUN` };
  return { title: `${raw} · WHERE 2 RUN` };
}

/** Localized nationwide primaries, candidates, and community agenda for one state. */
export default async function StateElectionsPage(props: StatePageProps) {
  const { state: raw } = await props.params;
  const { tab } = await props.searchParams;
  const state = resolveStateParam(raw);
  if (!state) return <ElectionRaceHub slug={raw} tab={tab} />;

  const supabase = await createServerSupabase();
  let setup: string | null = null;

  const { data: primaryRows, error: primaryError } = await supabase
    .from("primaries")
    .select("*")
    .or(`state.ilike.${state.code},state.ilike."${state.name}"`)
    .order("office_name", { ascending: true })
    .order("party", { ascending: true });

  if (primaryError) {
    setup = isMissingSchema(primaryError)
      ? "Apply the nationwide primaries migration, then reload."
      : primaryError.message;
  }

  const primaries = (primaryRows ?? []) as Primary[];
  const primaryIds = primaries.map((row) => row.id);

  let candidates: Candidate[] = [];
  let questions: PrimaryQuestion[] = [];

  if (!setup && primaryIds.length > 0) {
    const [candidateResult, questionResult] = await Promise.all([
      supabase
        .from("candidates")
        .select("*")
        .in("primary_id", primaryIds)
        .order("display_name", { ascending: true }),
      supabase
        .from("primary_questions")
        .select("*")
        .in("primary_id", primaryIds)
        .order("created_at", { ascending: false }),
    ]);

    if (candidateResult.error) {
      setup = isMissingSchema(candidateResult.error)
        ? "Apply the nationwide primaries migration, then reload."
        : candidateResult.error.message;
    } else {
      candidates = (candidateResult.data ?? []) as Candidate[];
    }

    if (!setup && questionResult.error) {
      setup = isMissingSchema(questionResult.error)
        ? "Apply the nationwide primaries migration, then reload."
        : questionResult.error.message;
    } else if (!setup) {
      questions = (questionResult.data ?? []) as PrimaryQuestion[];
    }
  }

  const candidatesByPrimary = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    if (!candidate.primary_id) continue;
    const list = candidatesByPrimary.get(candidate.primary_id) ?? [];
    list.push(candidate);
    candidatesByPrimary.set(candidate.primary_id, list);
  }

  const debateQueue = questions.filter((row) => row.kind === "debate");
  const primaryById = new Map(primaries.map((row) => [row.id, row]));
  const agendaTab = tab === "agenda";

  let agendaPrompts: AgendaRow[] = [];
  let agendaMissing = false;
  if (!setup && primaryIds.length > 0) {
    const promptResult = await supabase
      .from("community_prompts")
      .select("id, primary_id, title, content, upvote_count")
      .in("primary_id", primaryIds)
      .order("upvote_count", { ascending: false })
      .order("created_at", { ascending: true });
    if (promptResult.error) {
      agendaMissing = isMissingSchema(promptResult.error);
      if (!agendaMissing) setup = promptResult.error.message;
    } else {
      agendaPrompts = (promptResult.data ?? []) as AgendaRow[];
    }
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <Link href="/elections/states" className="text-[11px] uppercase tracking-[0.2em] text-amber-800">
          All states
        </Link>
        <header className="mt-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
            {state.name}
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Localized candidates and the community agenda for {state.code} primaries.
          </p>
        </header>

        <div role="tablist" aria-label="State elections" className="mt-8 flex flex-wrap gap-2">
          <Link
            href={`/elections/${state.code}`}
            role="tab"
            aria-selected={!agendaTab}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
              !agendaTab
                ? "bg-gold-strong text-stone-900"
                : "border border-gold/40 text-stone-600 hover:border-gold hover:text-stone-900",
            )}
          >
            Candidates
          </Link>
          <Link
            href={`/elections/${state.code}?tab=agenda`}
            role="tab"
            aria-selected={agendaTab}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
              agendaTab
                ? "bg-gold-strong text-stone-900"
                : "border border-gold/40 text-stone-600 hover:border-gold hover:text-stone-900",
            )}
          >
            Agenda Queue
          </Link>
        </div>

        {setup ? <p className="mt-8 text-sm text-stone-600">{setup}</p> : null}

        {!setup && primaries.length === 0 ? (
          <p className="mt-8 text-sm text-stone-600">No primaries filed in {state.name} yet.</p>
        ) : null}

        {!setup && !agendaTab && primaries.length > 0 ? (
          <section className="mt-10">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl text-stone-900">Candidates</h2>
              <InfoTooltip label="Ideology vectors" text={IDEOLOGY_VECTOR_TIP} />
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Contenders filed in this state, with their matched ideological coordinates.
            </p>
            <ul className="mt-6 grid gap-4">
              {primaries.map((primary) => {
                const filed = candidatesByPrimary.get(primary.id) ?? [];
                const office = primary.office?.trim() || primary.office_name;
                return (
                  <li key={primary.id} className="rounded-xl border border-amber-500/30 bg-white px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-stone-900">
                          {office}
                          {" · "}
                          {partyLabel(primary.party)}
                        </p>
                        <p className="mt-1 text-[11px] uppercase tracking-widest text-stone-600">
                          {primary.general_slug}
                          {primary.election_date ? ` · ${primary.election_date}` : null}
                        </p>
                      </div>
                      <Link
                        href={`/elections/${primary.slug}`}
                        className="text-[11px] uppercase tracking-widest text-amber-800"
                      >
                        Open primary
                      </Link>
                    </div>
                    {filed.length === 0 ? (
                      <p className="mt-4 text-sm text-stone-600">No candidates linked yet.</p>
                    ) : (
                      <ul className="mt-4 grid gap-3">
                        {filed.map((candidate) => {
                          const vector = parseVector(candidate.ideological_vector);
                          const compass = vector ? compassFromPlane(vector.x, vector.y) : null;
                          return (
                            <li
                              key={candidate.id}
                              className="flex flex-wrap items-start justify-between gap-4 border-t border-amber-500/20 pt-3"
                            >
                              <div>
                                <p className="text-sm font-medium text-stone-900">
                                  {candidate.display_name}
                                </p>
                                {candidate.bio ? (
                                  <p className="mt-1 max-w-md text-sm leading-6 text-stone-600">
                                    {candidate.bio}
                                  </p>
                                ) : null}
                                <p className="mt-2 text-[11px] uppercase tracking-widest text-stone-600">
                                  Vector {formatVector(vector)}
                                </p>
                              </div>
                              {compass ? (
                                <div className="w-28 shrink-0">
                                  <IdeologyCompass points={[{ ...compass }]} />
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {!setup && agendaTab ? (
          <section className="mt-10">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl text-stone-900">Agenda Queue</h2>
              <InfoTooltip label="District Agenda" text={DISTRICT_AGENDA_TIP} />
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Issues filed by verified voters, ranked by upvotes. Open a primary to file or upvote.
            </p>
            {agendaMissing ? (
              <p className="mt-4 text-sm text-stone-600">Apply the constituent agenda migration, then reload.</p>
            ) : agendaPrompts.length === 0 ? (
              <p className="mt-4 text-sm text-stone-600">No community issues in the queue yet.</p>
            ) : (
              <ol className="mt-4 grid gap-3">
                {agendaPrompts.map((item, index) => {
                  const primary = primaryById.get(item.primary_id);
                  return (
                    <li key={item.id} className="rounded-xl border border-amber-500/30 bg-white px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-widest text-stone-600">
                          {index + 1}. {primary ? partyLabel(primary.party) : "Primary"}
                          {primary ? ` · ${primary.office_name}` : null}
                        </p>
                        <p className="shrink-0 text-[11px] uppercase tracking-widest text-stone-700">
                          {item.upvote_count} upvotes
                        </p>
                      </div>
                      <h3 className="mt-2 text-sm font-medium text-stone-900">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-stone-600">{item.content}</p>
                      {primary ? (
                        <Link
                          href={`/elections/${primary.slug}?tab=agenda`}
                          className="mt-3 inline-flex text-[11px] uppercase tracking-widest text-amber-800"
                        >
                          Open primary
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        ) : null}

        {!setup && !agendaTab && debateQueue.length > 0 ? (
          <section className="mt-10">
            <h3 className="text-sm font-medium uppercase tracking-[0.16em] text-stone-600">
              Debate prompts
            </h3>
            <ul className="mt-3 grid gap-3">
              {debateQueue.map((item) => {
                const primary = primaryById.get(item.primary_id);
                return (
                  <li key={item.id} className="rounded-xl border border-amber-500/30 px-5 py-4">
                    <p className="text-[11px] uppercase tracking-widest text-stone-600">
                      {primary?.slug ?? "Primary"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-900">{item.prompt}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
