"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitStatewideIssue } from "@/app/lib/actions/agenda";
import { STATEWIDE_ISSUES_TIP, InfoTooltip } from "@/components/InfoTooltip";
import { AGENDA_CONTENT_MAX, AGENDA_TITLE_MAX } from "@/lib/platform/agenda";

export type StatewideIssue = {
  id: string;
  title: string;
  content: string;
  upvoteCount: number;
  officeName: string;
  partyLabel: string;
  primaryHref: string | null;
};

export type StatewideTarget = {
  id: string;
  label: string;
};

export function StatewideIssues({
  issues,
  targets,
  signedIn,
  verified,
  missing,
}: {
  issues: StatewideIssue[];
  targets: StatewideTarget[];
  signedIn: boolean;
  verified: boolean;
  missing: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <section className="mt-10">
      <h2 className="inline-flex items-center gap-2 font-display text-xl text-stone-900">
        Statewide Issues
        <InfoTooltip label="Statewide Issues" text={STATEWIDE_ISSUES_TIP} />
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Governor and U.S. Senate issues, ranked by upvotes. House and local agendas stay on their own primaries.
      </p>
      {missing ? (
        <p className="mt-4 text-sm text-stone-600">Apply the constituent agenda migration, then reload.</p>
      ) : issues.length === 0 ? (
        <p className="mt-4 text-sm text-stone-600">No statewide issues filed yet.</p>
      ) : (
        <ol className="mt-4 grid gap-3">
          {issues.map((item, index) => (
            <li key={item.id} className="rounded-xl border border-amber-500/30 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-widest text-stone-600">
                  {index + 1}. {item.partyLabel} · {item.officeName}
                </p>
                <p className="shrink-0 text-[11px] uppercase tracking-widest text-stone-700">
                  {item.upvoteCount} upvotes
                </p>
              </div>
              <h3 className="mt-2 text-sm font-medium text-stone-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{item.content}</p>
              {item.primaryHref ? (
                <Link
                  href={item.primaryHref}
                  className="mt-3 inline-flex text-[11px] uppercase tracking-widest text-amber-800"
                >
                  Open primary
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {error ? <p className="mt-4 text-sm text-stone-600">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-stone-900">{message}</p> : null}

      {!signedIn ? (
        <p className="mt-4 text-sm text-stone-600">
          <Link href="/auth/login" className="text-amber-800">
            Sign in
          </Link>{" "}
          to file a statewide issue.
        </p>
      ) : !verified ? (
        <p className="mt-4 text-sm text-stone-600">
          <Link href="/verify" className="text-amber-800">
            Verify with Stripe
          </Link>{" "}
          to file a statewide issue.
        </p>
      ) : targets.length === 0 ? (
        <p className="mt-4 text-sm text-stone-600">No open Governor or U.S. Senate primary is accepting issues.</p>
      ) : (
        <form
          className="mt-4 grid gap-3 rounded-xl border border-amber-500/30 bg-white px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (submitting) return;
            const form = event.currentTarget;
            const data = new FormData(form);
            setSubmitting(true);
            setError(null);
            setMessage(null);
            void submitStatewideIssue(
              String(data.get("primaryId") ?? ""),
              String(data.get("title") ?? ""),
              String(data.get("content") ?? ""),
            ).then((result) => {
              setSubmitting(false);
              if (result.error) {
                setError(result.error);
                return;
              }
              form.reset();
              setMessage(result.message ?? "Issue filed.");
              router.refresh();
            });
          }}
        >
          <p className="text-[11px] uppercase tracking-widest text-stone-600">File a statewide issue</p>
          <label className="grid gap-2 text-sm text-stone-600">
            Race
            <select
              name="primaryId"
              required
              defaultValue={targets[0]?.id}
              className="rounded-lg border border-amber-500/30 bg-white px-3 py-2 text-stone-900"
            >
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-stone-600">
            Title
            <input
              name="title"
              required
              maxLength={AGENDA_TITLE_MAX}
              className="rounded-lg border border-amber-500/30 bg-white px-3 py-2 text-stone-900"
            />
          </label>
          <label className="grid gap-2 text-sm text-stone-600">
            Description
            <textarea
              name="content"
              required
              maxLength={AGENDA_CONTENT_MAX}
              rows={4}
              className="rounded-lg border border-amber-500/30 bg-white px-3 py-2 text-stone-900"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="justify-self-start rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-900 disabled:opacity-50"
          >
            {submitting ? "Filing…" : "Submit issue"}
          </button>
        </form>
      )}
    </section>
  );
}
