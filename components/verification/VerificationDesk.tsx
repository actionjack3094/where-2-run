"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  loadMyVerification,
  simulateVerificationUpgrade,
} from "@/app/actions/verification";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";
import {
  VERIFICATION_STEPS,
  meetsVerificationTier,
  nextVerificationTier,
  parseVerificationTier,
  verificationLabel,
  type VerificationTier,
} from "@/lib/verification";

type DeskStage = "booting" | "ready" | "error";

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function VerificationDesk() {
  const [stage, setStage] = useState<DeskStage>("booting");
  const [tier, setTier] = useState<VerificationTier>("unverified");
  const [error, setError] = useState<string | null>(null);
  const [busyTier, setBusyTier] = useState<VerificationTier | null>(null);

  const refresh = useCallback(async () => {
    await ensureArenaUser();
    const token = await accessToken();
    const result = await loadMyVerification(token);
    setTier(parseVerificationTier(result.verificationTier));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setStage("ready");
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Could not load verification status.",
          );
          setStage("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function upgrade(next: VerificationTier) {
    setBusyTier(next);
    setError(null);
    try {
      await ensureArenaUser();
      const token = await accessToken();
      const result = await simulateVerificationUpgrade(next, token);
      setTier(parseVerificationTier(result.verificationTier));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upgrade verification.");
    } finally {
      setBusyTier(null);
    }
  }

  const next = nextVerificationTier(tier);

  if (stage === "booting") {
    return <p className="mt-10 text-sm leading-6 text-zinc-400">Opening the verification ledger…</p>;
  }

  if (stage === "error") {
    return (
      <div className="mt-10 space-y-4">
        <p className="text-sm leading-6 text-zinc-400">{error}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setStage("booting");
            setError(null);
            void refresh().then(
              () => setStage("ready"),
              (caught: unknown) => {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Could not load verification status.",
                );
                setStage("error");
              },
            );
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <section className="mt-10 flex flex-col gap-6">
      <Card>
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
            Current standing
          </p>
          <CardTitle className="mt-2 flex items-center gap-2 text-2xl">
            {verificationLabel(tier)}
            <VerificationBadge tier={tier} size="lg" decorative />
          </CardTitle>
          <CardDescription>
            {tier === "candidate_verified"
              ? "This campaign has cleared phone, voter file, and government ID review."
              : next
                ? `Next: ${VERIFICATION_STEPS.find((step) => step.tier === next)?.method}.`
                : "Climb the identity ladder to unlock civic participation."}
          </CardDescription>
        </CardHeader>
      </Card>

      {error ? <p className="text-sm leading-6 text-red-300">{error}</p> : null}

      <ol className="flex flex-col gap-3">
        {VERIFICATION_STEPS.map((step) => {
          const complete = meetsVerificationTier(tier, step.tier);
          const isNext = next === step.tier;
          const locked = !complete && !isNext;

          return (
            <li key={step.tier}>
              <article
                className={cn(
                  "rounded-xl border bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]",
                  complete ? "border-gold/70" : "border-gold/40",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                      Step {step.step} · {step.method}
                    </p>
                    <h2 className="mt-2 flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-parchment">
                      {step.title}
                      {complete ? (
                        <ShieldCheck aria-hidden className="h-4 w-4 text-gold" />
                      ) : null}
                    </h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">{step.unlocks}</p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-[11px] font-medium uppercase tracking-widest",
                      complete ? "text-gold" : locked ? "text-zinc-500" : "text-parchment",
                    )}
                  >
                    {complete ? "Cleared" : isNext ? "Ready" : "Locked"}
                  </p>
                </div>

                {isNext ? (
                  <Button
                    type="button"
                    variant="gold"
                    className="mt-5"
                    disabled={busyTier !== null}
                    onClick={() => void upgrade(step.tier)}
                  >
                    {busyTier === step.tier ? step.mockPending : step.mockLabel}
                  </Button>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
