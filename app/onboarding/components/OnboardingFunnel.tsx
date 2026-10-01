"use client";

import { useState } from "react";
import { AddressStep } from "@/app/onboarding/components/AddressStep";
import { CalibrationStep } from "@/app/onboarding/components/CalibrationStep";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "address", eyebrow: "Step 01", title: "District match" },
  { id: "calibration", eyebrow: "Step 02", title: "Baseline vector" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function OnboardingFunnel({ startAt }: { startAt: StepId }) {
  const [step, setStep] = useState<StepId>(startAt);
  const [districtLabel, setDistrictLabel] = useState<string | null>(null);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            New user
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Onboarding
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Map your ZIP to a congressional district, answer three questions, then
            see your first arena matches.
          </p>
        </header>

        <ol className="mt-8 grid gap-3 sm:grid-cols-2">
          {STEPS.map((item) => {
            const active = item.id === step;
            const complete = item.id === "address" && step === "calibration";
            return (
              <li
                key={item.id}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "rounded-xl border px-3 py-3",
                  active
                    ? "border-gold bg-gold/10 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
                    : complete
                      ? "border-gold/40 bg-zinc-900"
                      : "border-zinc-800 bg-zinc-950",
                )}
              >
                <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                  {item.eyebrow}
                </span>
                <span
                  className={cn(
                    "mt-1 block font-display text-sm font-semibold",
                    active || complete ? "text-parchment" : "text-zinc-500",
                  )}
                >
                  {item.title}
                </span>
              </li>
            );
          })}
        </ol>

        {districtLabel && step === "calibration" ? (
          <p className="mt-6 text-sm leading-6 text-zinc-400">
            Mapped to <span className="text-parchment">{districtLabel}</span>.
          </p>
        ) : null}

        {step === "address" ? (
          <AddressStep
            onComplete={(match) => {
              setDistrictLabel(match.label);
              setStep("calibration");
            }}
          />
        ) : (
          <CalibrationStep onBack={() => setStep("address")} />
        )}
      </div>
    </main>
  );
}
