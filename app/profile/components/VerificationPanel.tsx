"use client";

import { useEffect, useState, useTransition } from "react";
import { BadgeCheck, Hourglass } from "lucide-react";
import {
  loadVerificationPanel,
  submitTier2Verification,
  type VerificationPanelState,
} from "@/lib/actions/verification";
import { supabase } from "@/lib/db/supabase";
import { TIER2_DOCUMENT_TYPES, type Tier2DocumentTypeId } from "@/lib/verification-documents";

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Manual (Tier 2) residency claim for the user's primary home district. The
 * address-lookup verification above it can already cover a district; this is
 * for claims that need a document reviewed.
 */
export function VerificationPanel() {
  const [state, setState] = useState<VerificationPanelState | null>(null);
  const [documentType, setDocumentType] = useState<Tier2DocumentTypeId>(TIER2_DOCUMENT_TYPES[0].id);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void accessToken()
      .then((token) => loadVerificationPanel(token))
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState({ ok: false, error: "We couldn't load your verification status." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function submit(ocdId: string) {
    if (pending) return;
    setError(null);

    startTransition(async () => {
      try {
        const result = await submitTier2Verification(ocdId, documentType, await accessToken());
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setState(await loadVerificationPanel(await accessToken()));
      } catch {
        setError("We couldn't submit that verification. Please try again.");
      }
    });
  }

  const ready = state?.ok ? state : null;
  const isPending = ready?.request?.status === "pending";
  const wasRejected = ready?.request?.status === "rejected";

  return (
    <section
      aria-labelledby="tier2-claim-heading"
      className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5"
    >
      <p className="text-[11px] font-medium uppercase tracking-widest text-gold">Document review · by hand</p>
      <h2
        id="tier2-claim-heading"
        className="mt-2 font-display text-xl font-semibold tracking-tight text-parchment"
      >
        Tier 2: Manual Constituent Verification
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Can&apos;t get an instant address match, or it got your district wrong? Submit a
        document and a reviewer will confirm your residency. Once approved, your ballots
        in that district count 3x. Approval is not instant.
      </p>

      {!state ? (
        <p className="mt-4 text-sm leading-6 text-zinc-400">Checking verification…</p>
      ) : !state.ok ? (
        <p className="mt-4 text-sm leading-6 text-rose-300" role="alert">
          {state.error}
        </p>
      ) : !state.ocdId ? (
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          No home district on file yet. Use the Tier 1 address match above to add one.
        </p>
      ) : state.verified ? (
        <p
          role="status"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold bg-zinc-950 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-gold"
        >
          <BadgeCheck className="size-4" aria-hidden />
          Verified · {state.districtName}
        </p>
      ) : isPending ? (
        <div className="mt-4">
          <p
            role="status"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-300"
          >
            <Hourglass className="size-4" aria-hidden />
            Verification Pending Review
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Your document claim for {state.districtName} is waiting for a reviewer. Your
            ballots count 3x there once it is approved.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex max-w-md flex-col gap-3">
          {wasRejected ? (
            <p className="text-sm leading-6 text-zinc-400">
              Your last claim for {state.districtName} was not approved. You can file a new one.
            </p>
          ) : null}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Proof of residency
            </span>
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value as Tier2DocumentTypeId)}
              disabled={pending}
              className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-parchment outline-none focus:border-gold"
            >
              {TIER2_DOCUMENT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(state.ocdId!)}
            className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-950 transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Submitting…" : `Verify Residency for ${state.districtName}`}
          </button>
          <p className="text-xs leading-5 text-zinc-500">
            Mock claim. No document is uploaded or checked yet.
          </p>
          {error ? (
            <p className="text-sm leading-6 text-rose-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
