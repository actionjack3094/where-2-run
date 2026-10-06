"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createSoapboxChallenge, loadSharedPrimaries, type SharedPrimary } from "@/lib/actions/soapbox";

export function ChallengeModal({
  open,
  postId,
  authorId,
  authorName,
  onClose,
}: {
  open: boolean;
  postId: string;
  authorId: string;
  authorName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [primaries, setPrimaries] = useState<SharedPrimary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [stance, setStance] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPrimaries([]);
    setSelected([]);
    setStance("");
    void loadSharedPrimaries(authorId).then((result) => {
      if (cancelled) return;
      setPrimaries(result.primaries);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, authorId]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await createSoapboxChallenge({
      postId,
      primaryIds: selected,
      openingStance: stance,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-amber-500/30 bg-white text-stone-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-widest text-stone-600">The Soapbox</p>
          <h2 id={titleId} className="font-display text-lg font-semibold tracking-tight text-stone-900">
            Challenge {authorName}
          </h2>
          <p className="text-sm leading-6 text-stone-600">
            The result propagates to every race you select. The author has 24 hours to accept.
          </p>
        </div>

        <form className="flex flex-col gap-4 px-5 pb-5" onSubmit={(event) => void onSubmit(event)}>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-medium uppercase tracking-widest text-stone-600">
              Select the races this debate will contest
            </legend>
            {loading ? <p className="text-sm text-stone-600">Loading shared primaries…</p> : null}
            {!loading && primaries.length === 0 && !error ? (
              <p className="text-sm leading-6 text-stone-600">
                You and this author do not share an open primary.
              </p>
            ) : null}
            <div className="grid max-h-48 gap-2 overflow-y-auto">
              {primaries.map((primary) => (
                <label
                  key={primary.id}
                  className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-white px-3 py-2 text-sm text-stone-700"
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-gold"
                    checked={selected.includes(primary.id)}
                    onChange={() => toggle(primary.id)}
                  />
                  <span>{primary.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-widest text-stone-600">
              Opening stance
            </span>
            <textarea
              value={stance}
              onChange={(event) => setStance(event.target.value)}
              required
              rows={5}
              maxLength={2000}
              placeholder="File the stance you want judged against this speech."
              className="resize-none rounded-md border border-amber-500/30 bg-white px-3 py-2 text-sm leading-6 text-stone-900 outline-none placeholder:text-stone-400 focus:border-gold"
            />
          </label>

          {error ? <p className="text-sm leading-6 text-stone-600">{error}</p> : null}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || loading || primaries.length === 0}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-900 transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Filing…" : "File challenge"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-md border border-amber-500/30 px-4 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
