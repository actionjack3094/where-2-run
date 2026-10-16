import Link from "next/link";
import type { UnansweredQuestion } from "@/lib/debates/unanswered-questions";

const CTA =
  "mt-4 inline-flex rounded-md bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-700";

export function UnansweredQuestionItem({ question }: { question: UnansweredQuestion }) {
  return (
    <article className="mb-4 rounded-2xl border border-amber-200/70 bg-white p-6 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-widest text-amber-800">{question.office}</p>
      <h2 className="mt-2 text-base font-semibold text-stone-900">{question.title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-700">{question.content}</p>
      {question.primarySlug ? (
        <Link href={`/debates/create?primary=${question.primarySlug}`} className={CTA}>
          Take the Floor
        </Link>
      ) : null}
    </article>
  );
}
