"use client";

import { useState } from "react";
import Link from "next/link";
import { calculateArenaRatingChange } from "@/lib/arena-rank";
import { LENA_CANDIDATE_HREF, TX10_ISSUES } from "@/lib/tx10-spine";

const OPENING =
  "Federal zoning should follow the pipes, not a national slogan. TX-10 runs from East Austin through Bastrop, Giddings, and Brenham, and those places do not share one housing map. I will support a density bonus only where a city already has transit, water, and an open classroom. I will vote against a mandate that drops apartments onto a county road served by a septic tank. Before another federally backed lane or unit is approved, publish the displacement count for the I-35 corridor and require a local-hire share on the job. Counties that fail the infrastructure test can opt out. A housing bill that ignores the emergency rooms from Bastrop to Brenham is a map exercise, so a floor for those hospitals belongs in the same vote. School-bond math stays public: payoff date, fee, and unit count, before any filing fee is treated as a campaign prop. That is the opening I will defend for the next 48 hours. I will not trade this map for a filing-fee slogan.";

const SAMPLE =
  "Caleb's county opt-out is a delay, not a housing plan. East Austin renters on the TX-10 edge cannot wait on a vote while the I-35 displacement count stays unpublished. I support a density bonus only where transit, water, and a classroom already exist, and I will vote down any mandate that plants apartments on a septic-tank county road. Before another federally backed lane or unit is approved, publish that displacement count and require a local-hire share. The same bill floors emergency rooms from Bastrop to Brenham and prints the school-bond payoff date, fee, and unit count before a filing fee becomes a slogan. Counties that fail the infrastructure test keep their veto. That is the rebuttal I am filing inside this 48-hour clock.";

const LENA_AR = 1340;
const CALEB_AR = 1410;
const LENA_DELTA = calculateArenaRatingChange(LENA_AR, CALEB_AR, 1, 1.35);

const CTA =
  "inline-flex rounded-md bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40";

function ar(value: number) {
  return value.toLocaleString("en-US");
}

export function FeaturedClash() {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [posted, setPosted] = useState<string | null>(null);
  const lenaNext = LENA_AR + LENA_DELTA;

  return (
    <article className="mb-4 rounded-2xl border border-amber-200/70 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold leading-6 text-amber-900">
        TX-10 Agenda #1 (142 Upvotes): Federal Zoning & Housing Density Mandates
      </p>
      <h2 className="mt-3 text-sm font-semibold text-stone-900">#1 Contender · Caleb Nguyen (1,410 AR)</h2>
      <p className="mt-3 text-sm leading-6 text-stone-800">{OPENING}</p>
      <h3 className="mt-5 text-sm font-semibold text-stone-900">#2 Contender · Lena Ortiz (1,340 AR)</h3>
      {posted ? (
        <p className="mt-2 inline-flex rounded-full border border-emerald-500/50 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
          Rebuttal Posted · 48h Clock Cleared
        </p>
      ) : (
        <p className="mt-2 inline-flex rounded-full border border-amber-500/50 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
          46h 12m remaining on 48-hour rebuttal clock
        </p>
      )}
      {posted ? (
        <p className="mt-3 text-sm leading-6 text-stone-800">{posted}</p>
      ) : (
        <div>
          <button type="button" className={`${CTA} mt-4`} onClick={() => setComposing(true)}>
            Post Rebuttal (+54 AR at stake)
          </button>
          {composing ? (
            <div className="mt-4 grid gap-2">
              <label className="grid gap-2 text-sm text-stone-600">
                Rebuttal
                <textarea
                  value={draft}
                  maxLength={1000}
                  rows={5}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Answer Caleb on TX-10 zoning reform."
                  className="rounded-lg border border-stone-300 px-3 py-2 text-stone-900 outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
                />
              </label>
              <span className="text-xs text-stone-500">{draft.length.toLocaleString("en-US")} / 1,000 character limit</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(SAMPLE)}
                  className="rounded-md border border-amber-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-800"
                >
                  Load Sample TX-10 Zoning Rebuttal
                </button>
                <button
                  type="button"
                  className={CTA}
                  disabled={!draft.trim()}
                  onClick={() => setPosted(draft.trim())}
                >
                  Submit Rebuttal & Score Clash
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
      {posted ? (
        <section className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <h3 className="text-sm font-bold text-emerald-950">AI Judge & Elo Clash Scorecard</h3>
          <ul className="mt-3 grid gap-1.5 text-sm leading-6 text-emerald-950">
            <li>Substance & Policy Trade-off Score: 94/100</li>
            <li>TX-10 Ideological Adherence Multiplier: 1.35x (92% -&gt; 94% Match)</li>
            <li>
              Arena Rating Update: Lena Ortiz {ar(LENA_AR)} AR -&gt; {ar(lenaNext)} AR (+{LENA_DELTA} AR vs. #1
              Contender)
            </li>
            <li>Opponent Update: Caleb Nguyen {ar(CALEB_AR)} AR -&gt; 1,380 AR (-30 AR)</li>
          </ul>
          <Link
            href={LENA_CANDIDATE_HREF}
            className="mt-4 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-800"
          >
            View Updated Contender Dossier -&gt;
          </Link>
        </section>
      ) : null}
    </article>
  );
}

export function AgendaQueue() {
  return (
    <ul className="mb-4 grid gap-3">
      {TX10_ISSUES.map((issue) => (
        <li key={issue.id} className="rounded-2xl border border-amber-200/70 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-stone-900">{issue.title}</p>
          <p className="mt-2 text-sm leading-6 text-stone-600">{issue.content}</p>
          <p className="mt-3 inline-flex rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-800">
            {issue.upvotes} upvotes
          </p>
        </li>
      ))}
    </ul>
  );
}
