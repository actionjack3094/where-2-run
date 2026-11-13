"use client";

import { useEffect, useRef, useState } from "react";

const PLEDGE_AMOUNTS = [25, 50, 100, 250] as const;

type PledgeAmount = (typeof PLEDGE_AMOUNTS)[number];

export function EscrowPledgeModal({
  isOpen,
  onClose,
  candidateName,
}: {
  isOpen: boolean;
  onClose: () => void;
  candidateName: string;
}) {
  const [amount, setAmount] = useState<PledgeAmount>(25);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !lock.current) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function close() {
    if (lock.current) return;
    onClose();
  }

  function authorize() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    window.setTimeout(() => {
      lock.current = false;
      setPending(false);
      onClose();
    }, 600);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="escrow-pledge-title"
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-amber-200 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="escrow-pledge-title" className="font-display text-xl font-semibold tracking-tight text-stone-900">
          Pledge Escrow for {candidateName}
        </h2>
        <p className="bg-stone-50 border border-stone-200 text-stone-700 text-sm p-3 rounded-lg mb-6 mt-4 leading-5">
          Conditional Pledge: Your funds are held securely in escrow toward the statutory primary filing fee.
          You will only be charged if this candidate maintains Tier 1 Contender status (1,300+ AR) in the U.S.
          House - TX-10 Primary and officially files for the ballot. If they do not run, your card is never
          charged.
        </p>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-stone-500">Pledge amount</p>
        <div className="grid grid-cols-4 gap-2">
          {PLEDGE_AMOUNTS.map((value) => {
            const selected = value === amount;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                disabled={pending}
                onClick={() => setAmount(value)}
                className={`rounded-lg border px-2 py-2.5 text-sm font-semibold tabular-nums transition ${
                  selected
                    ? "bg-amber-100 border-amber-600 text-amber-900"
                    : "border-stone-200 text-stone-600 hover:border-stone-300"
                }`}
              >
                ${value}
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={authorize}
            disabled={pending}
            aria-busy={pending}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
          >
            {pending ? "Authorizing…" : `Authorize $${amount} Pledge`}
          </button>
        </div>
      </div>
    </div>
  );
}
