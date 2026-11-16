"use client";

import { useState } from "react";
import Link from "next/link";
import { TX10_ISSUES } from "@/lib/tx10-spine";

const OPENING =
  "Federal zoning should follow the pipes, not a national slogan. TX-10 runs from East Austin through Bastrop, Giddings, and Brenham, and those places do not share one housing map. I will support a density bonus only where a city already has transit, water, and an open classroom. I will vote against a mandate that drops apartments onto a county road served by a septic tank. Before another federally backed lane or unit is approved, publish the displacement count for the I-35 corridor and require a local-hire share on the job. Counties that fail the infrastructure test can opt out. A housing bill that ignores the emergency rooms from Bastrop to Brenham is a map exercise, so a floor for those hospitals belongs in the same vote. School-bond math stays public: payoff date, fee, and unit count, before any filing fee is treated as a campaign prop. That is the opening I will defend for the next 48 hours. I will not trade this map for a filing-fee slogan.";

const CTA =
  "mt-4 inline-flex rounded-md bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-700";

export function FeaturedClash({ signedIn }: { signedIn: boolean }) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <article className="mb-4 rounded-2xl border border-amber-200/70 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold leading-6 text-amber-900">
        TX-10 Agenda #1 (142 Upvotes): Federal Zoning & Housing Density Mandates
      </p>
      <h2 className="mt-3 text-sm font-semibold text-stone-900">#1 Contender · Caleb Nguyen (1,410 AR)</h2>
      <p className="mt-3 text-sm leading-6 text-stone-800">{OPENING}</p>
      <h3 className="mt-5 text-sm font-semibold text-stone-900">#2 Contender · Lena Ortiz (1,340 AR)</h3>
      <p className="mt-2 inline-flex rounded-full border border-amber-500/50 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
        46h 12m remaining on 48-hour rebuttal clock
      </p>
      {signedIn ? (
        <div>
          <button type="button" className={CTA} onClick={() => setComposing(true)}>
            Post Rebuttal (+54 AR at stake)
          </button>
          {composing ? (
            <label className="mt-4 grid gap-2 text-sm text-stone-600">
              Rebuttal
              <textarea
                value={draft}
                maxLength={1000}
                rows={5}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Answer Caleb on TX-10 zoning reform."
                className="rounded-lg border border-stone-300 px-3 py-2 text-stone-900 outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
              />
              <span className="text-xs text-stone-500">{draft.length}/1000</span>
            </label>
          ) : null}
        </div>
      ) : (
        <Link href="/auth/login?next=/debates" className={CTA}>
          Post Rebuttal (+54 AR at stake)
        </Link>
      )}
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
