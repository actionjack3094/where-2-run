import Link from "next/link";
import { IdeologyCompass, compassFromPlane } from "@/components/IdeologyCompass";
import { DISTRICT_AGENDA_TIP, IDEOLOGY_VECTOR_TIP, InfoTooltip } from "@/components/InfoTooltip";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { partyLabel } from "@/lib/platform/types";
import type { Candidate, Primary, PrimaryQuestion } from "@/types/database.types";

type StateMatch = { code: string; name: string };

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

/** Localized nationwide primaries, candidates, and community agenda for one state. */
export async function StateElectionsView({ state }: { state: StateMatch }) {
  const supabase = await createServerSupabase();
  let setup: string | null = null;

  const { data: primaryRows, error: primaryError } = await supabase
    .from("primaries")
    .select("*")
    .eq("state", state.code)
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

  const agenda = questions.filter((row) => row.kind === "community");
  const debateQueue = questions.filter((row) => row.kind === "debate");
  const primaryById = new Map(primaries.map((row) => [row.id, row]));

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

        {setup ? <p className="mt-8 text-sm text-stone-600">{setup}</p> : null}

        {!setup && primaries.length === 0 ? (
          <p className="mt-8 text-sm text-stone-600">No primaries filed in {state.name} yet.</p>
        ) : null}

        {!setup && primaries.length > 0 ? (
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

        {!setup ? (
          <section className="mt-10">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl text-stone-900">Community agenda</h2>
              <InfoTooltip label="District Agenda" text={DISTRICT_AGENDA_TIP} />
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Queue of community prompts attached to this state&apos;s primaries.
            </p>
            {agenda.length === 0 ? (
              <p className="mt-4 text-sm text-stone-600">No community questions in the queue yet.</p>
            ) : (
              <ol className="mt-4 grid gap-3">
                {agenda.map((item, index) => {
                  const primary = primaryById.get(item.primary_id);
                  return (
                    <li key={item.id} className="rounded-xl border border-amber-500/30 bg-white px-5 py-4">
                      <p className="text-[11px] uppercase tracking-widest text-stone-600">
                        {index + 1}. {primary ? partyLabel(primary.party) : "Primary"}
                        {primary ? ` · ${primary.slug}` : null}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-900">{item.prompt}</p>
                    </li>
                  );
                })}
              </ol>
            )}

            {debateQueue.length > 0 ? (
              <div className="mt-8">
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
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
