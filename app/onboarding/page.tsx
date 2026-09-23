"use client";

import { useState } from "react";
import { Tier2Verification } from "@/app/profile/components/Tier2Verification";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DraftReveal } from "./components/DraftReveal";
import { FoundationalCalibration } from "./components/FoundationalCalibration";

const STEPS = [
  { id: 1, eyebrow: "Step 01", title: "Geographic fencing" },
  { id: 2, eyebrow: "Step 02", title: "Foundational calibration" },
  { id: 3, eyebrow: "Step 03", title: "Draft reveal" },
] as const;

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [fenced, setFenced] = useState(false);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Candidate filing
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Onboarding
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Verify where you live, file a six-axis baseline, then see the three races
            where that vector is most viable.
          </p>
        </header>

        <ol className="mt-8 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step) => {
            const active = step.id === currentStep;
            const complete = step.id < currentStep;
            return (
              <li
                key={step.id}
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
                  {step.eyebrow}
                </span>
                <span
                  className={cn(
                    "mt-1 block font-display text-sm font-semibold",
                    active || complete ? "text-parchment" : "text-zinc-500",
                  )}
                >
                  {step.title}
                </span>
              </li>
            );
          })}
        </ol>

        {currentStep === 1 ? (
          <div className="mt-10 flex flex-col gap-6">
            <Tier2Verification
              onStatus={(state) => setFenced(state.verified && state.ocdIds.length > 0)}
              onVerified={() => setCurrentStep(2)}
            />
            {fenced ? (
              <Button type="button" variant="gold" onClick={() => setCurrentStep(2)}>
                Continue
              </Button>
            ) : null}
          </div>
        ) : null}

        {currentStep === 2 ? (
          <FoundationalCalibration
            onBack={() => setCurrentStep(1)}
            onComplete={() => setCurrentStep(3)}
          />
        ) : null}

        {currentStep === 3 ? <DraftReveal onBack={() => setCurrentStep(2)} /> : null}
      </div>
    </main>
  );
}
