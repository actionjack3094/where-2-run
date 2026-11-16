import Link from "next/link";
import { TX10_ISSUES } from "@/lib/tx10-spine";

export function Tx10Agenda() {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl text-stone-900">Agenda Queue</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Verified voters file the issues. Candidates open debates from the highest voted ones.
      </p>
      <ol className="mt-4 grid gap-4">
        {TX10_ISSUES.map((issue) => (
          <li key={issue.id} className="rounded-xl border border-amber-500/30 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-medium text-stone-900">{issue.title}</h3>
              <p className="shrink-0 rounded-full border border-amber-500/40 px-3 py-1 text-[11px] uppercase tracking-widest text-stone-700">
                {issue.upvotes} upvotes
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">{issue.content}</p>
            <Link href="/debates" className="mt-3 inline-flex text-xs uppercase tracking-widest text-amber-800">
              Debate this issue
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
