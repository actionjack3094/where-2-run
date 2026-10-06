"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InfoTooltip, PLEDGED_ESCROW_TIP } from "@/components/InfoTooltip";
import { enlistForCampaign, pledgeWarChest } from "@/lib/actions/support";
import { formatUsd } from "@/lib/pledges";
import { cn } from "@/lib/utils";

export function BallotSupportBar({
  candidateId,
  primaryId,
  warChest,
  enlisted,
  signedIn,
}: {
  candidateId: string;
  primaryId: string;
  warChest: number;
  enlisted: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [pledged, setPledged] = useState(false);
  const [joined, setJoined] = useState(enlisted);
  const [pending, setPending] = useState<"pledge" | "volunteer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = "/ballot";

  if (!signedIn) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/auth/login?next=${encodeURIComponent(next)}`}
          className="inline-flex h-9 items-center justify-center rounded-md bg-gold-strong px-3 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
        >
          Pledge $10
        </Link>
        <Link
          href={`/auth/login?next=${encodeURIComponent(next)}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-gold/50 px-3 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
        >
          Volunteer
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-stone-600">
        Pledged Escrow {formatUsd(warChest)}
        <InfoTooltip label="Pledged Escrow" text={PLEDGED_ESCROW_TIP} />
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending != null || pledged}
          onClick={() => {
            setPending("pledge");
            setError(null);
            void pledgeWarChest(candidateId, primaryId, 10).then((result) => {
              setPending(null);
              if (result.error) {
                setError(result.error);
                return;
              }
              setPledged(true);
              router.refresh();
            });
          }}
          className="inline-flex h-9 items-center justify-center rounded-md bg-gold-strong px-3 text-[11px] font-semibold uppercase tracking-widest text-stone-900 disabled:opacity-60"
        >
          {pledged ? "Pledged $10" : pending === "pledge" ? "Pledging…" : "Pledge $10"}
        </button>
        <button
          type="button"
          disabled={pending != null || joined}
          onClick={() => {
            setPending("volunteer");
            setError(null);
            void enlistForCampaign(candidateId, primaryId).then((result) => {
              setPending(null);
              if (result.error) {
                setError(result.error);
                return;
              }
              setJoined(true);
              router.refresh();
            });
          }}
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-md border px-3 text-[11px] font-semibold uppercase tracking-widest disabled:opacity-80",
            joined
              ? "border-gold bg-white text-amber-800"
              : "border-gold/50 text-stone-900 hover:border-gold",
          )}
        >
          {joined ? "✓ Enlisted" : pending === "volunteer" ? "Enlisting…" : "Volunteer"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs leading-5 text-stone-600">{error}</p> : null}
    </div>
  );
}
