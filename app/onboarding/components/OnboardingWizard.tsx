"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { processOnboarding } from "@/app/actions/candidate/process-onboarding";
import { Button } from "@/components/ui/button";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import {
  BIO_MAX,
  CORE_POLICY_PROMPTS,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  LIKERT_MAX,
  LIKERT_MIN,
  LIKERT_POINTS,
  OFFICE_OPTIONS,
  defaultOnboardingQuiz,
  likertLabel,
  type OnboardingQuiz,
  type PolicyPromptId,
} from "@/lib/ideology/onboarding";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    id: 1,
    title: "Identity & Profile",
    eyebrow: "Step 01",
    description: "Name the campaign and the office you intend to file for.",
  },
  {
    id: 2,
    title: "Ideological Calibration",
    eyebrow: "Step 02",
    description: "Score the core policy floor. Each answer becomes a coordinate.",
  },
  {
    id: 3,
    title: "Conduit PAC Agreement",
    eyebrow: "Step 03",
    description: "Authorize vaulted pledges that capture only after you file.",
  },
] as const;

type WizardStep = (typeof STEPS)[number]["id"];

type IdentityState = {
  displayName: string;
  officeSought: (typeof OFFICE_OPTIONS)[number] | "";
  bio: string;
  state: string;
};

function isNextRedirectError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const digest =
    "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return digest.startsWith("NEXT_REDIRECT");
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function goldTrack(value: number) {
  const pct = ((value - LIKERT_MIN) / (LIKERT_MAX - LIKERT_MIN)) * 100;
  return `linear-gradient(to right, var(--gold) ${pct}%, rgb(39 39 42) ${pct}%)`;
}

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [identity, setIdentity] = useState<IdentityState>({
    displayName: "",
    officeSought: "",
    bio: "",
    state: "",
  });
  const [quiz, setQuiz] = useState<OnboardingQuiz>(defaultOnboardingQuiz);
  const [pacAccepted, setPacAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [calibrationVisited, setCalibrationVisited] = useState(false);

  const identityValid =
    identity.displayName.trim().length >= DISPLAY_NAME_MIN &&
    identity.displayName.trim().length <= DISPLAY_NAME_MAX &&
    identity.officeSought !== "" &&
    identity.bio.trim().length <= BIO_MAX;

  const quizValid = CORE_POLICY_PROMPTS.every((prompt) =>
    Number.isFinite(quiz[prompt.id]),
  );
  const canAdvance =
    step === 1 ? identityValid : step === 2 ? quizValid : pacAccepted;

  function goTo(next: WizardStep) {
    if (next > step && !canAdvance) return;
    if (next === 3 && (step < 2 || !quizValid)) return;
    setError(null);
    if (next === 2) setCalibrationVisited(true);
    setStep(next);
  }

  async function submit() {
    if (!canAdvance || busy || identity.officeSought === "") return;
    setBusy(true);
    setError(null);
    try {
      await ensureArenaUser(identity.displayName.trim());
      const token = await accessToken();
      await processOnboarding(
        {
          identity: {
            displayName: identity.displayName.trim(),
            officeSought: identity.officeSought,
            bio: identity.bio.trim(),
            state: identity.state.trim(),
          },
          quiz,
          pacAgreementAccepted: true,
        },
        token,
      );
    } catch (caught) {
      if (isNextRedirectError(caught)) {
        const { data } = await supabase.auth.getSession();
        const id = data.session?.user.id;
        if (id) router.push(`/candidate/${id}`);
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "Could not file your candidate ticket.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 flex flex-1 flex-col">
      <ProgressIndicator
        current={step}
        onSelect={goTo}
        quizReady={quizValid && calibrationVisited}
        identityReady={identityValid}
      />

      {step === 1 ? (
        <IdentityStep identity={identity} onChange={setIdentity} />
      ) : null}
      {step === 2 ? (
        <CalibrationStep quiz={quiz} onChange={setQuiz} />
      ) : null}
      {step === 3 ? (
        <PacStep accepted={pacAccepted} onChange={setPacAccepted} name={identity.displayName} />
      ) : null}

      {error ? (
        <p className="mt-6 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => goTo((step - 1) as WizardStep)}
          disabled={step === 1 || busy}
        >
          Back
        </Button>
        {step < 3 ? (
          <Button
            type="button"
            variant="gold"
            disabled={!canAdvance || busy}
            onClick={() => goTo((step + 1) as WizardStep)}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            variant="gold"
            disabled={!canAdvance || busy}
            onClick={() => void submit()}
          >
            {busy ? "Filing ticket…" : "File candidate ticket"}
          </Button>
        )}
      </div>
    </section>
  );
}

function ProgressIndicator({
  current,
  onSelect,
  identityReady,
  quizReady,
}: {
  current: WizardStep;
  onSelect: (step: WizardStep) => void;
  identityReady: boolean;
  quizReady: boolean;
}) {
  return (
    <ol className="grid gap-4 sm:grid-cols-3">
      {STEPS.map((item, index) => {
        const complete =
          item.id < current ||
          (item.id === 1 && identityReady && current > 1) ||
          (item.id === 2 && quizReady && current > 2);
        const active = item.id === current;
        const reachable =
          item.id === 1 ||
          (item.id === 2 && identityReady) ||
          (item.id === 3 && identityReady && quizReady);

        return (
          <li key={item.id} className="relative">
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-4 left-[calc(50%+1.35rem)] hidden h-px w-[calc(100%-1.1rem)] sm:block",
                  item.id < current ? "bg-gold" : "bg-zinc-800",
                )}
              />
            ) : null}
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                active
                  ? "border-gold bg-gold/10 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
                  : complete
                    ? "border-gold/40 bg-zinc-900 hover:border-gold"
                    : "border-zinc-800 bg-zinc-950 hover:border-zinc-700",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                  active || complete
                    ? "border-gold bg-gold text-zinc-950"
                    : "border-zinc-700 text-zinc-500",
                )}
              >
                {item.id}
              </span>
              <span>
                <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                  {item.eyebrow}
                </span>
                <span
                  className={cn(
                    "mt-1 block font-display text-sm font-semibold leading-5",
                    active || complete ? "text-parchment" : "text-zinc-400",
                  )}
                >
                  {item.title}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function IdentityStep({
  identity,
  onChange,
}: {
  identity: IdentityState;
  onChange: (next: IdentityState) => void;
}) {
  const field =
    "h-11 w-full rounded-md border border-gold/40 bg-zinc-950 px-3 text-sm text-parchment outline-none transition-colors placeholder:text-zinc-600 focus:border-gold focus:ring-2 focus:ring-gold/30";

  return (
    <div className="mt-10 space-y-6">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
          {STEPS[0].eyebrow}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-parchment">
          {STEPS[0].title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{STEPS[0].description}</p>
      </header>

      <label className="block space-y-2">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Campaign name
        </span>
        <input
          type="text"
          value={identity.displayName}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="name"
          placeholder="Jordan Hale"
          className={field}
          onChange={(event) =>
            onChange({ ...identity, displayName: event.target.value })
          }
        />
      </label>

      <label className="block space-y-2">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Office sought
        </span>
        <select
          value={identity.officeSought}
          className={cn(field, "appearance-none")}
          onChange={(event) =>
            onChange({
              ...identity,
              officeSought: event.target.value as IdentityState["officeSought"],
            })
          }
        >
          <option value="">Select an office</option>
          {OFFICE_OPTIONS.map((office) => (
            <option key={office} value={office}>
              {office}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Home state
        </span>
        <input
          type="text"
          value={identity.state}
          maxLength={40}
          placeholder="Texas"
          className={field}
          onChange={(event) => onChange({ ...identity, state: event.target.value })}
        />
      </label>

      <label className="block space-y-2">
        <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Campaign statement
          <span className="tabular-nums text-zinc-600">
            {identity.bio.length}/{BIO_MAX}
          </span>
        </span>
        <textarea
          value={identity.bio}
          maxLength={BIO_MAX}
          rows={4}
          placeholder="One paragraph on why this seat, and why now."
          className="w-full rounded-md border border-gold/40 bg-zinc-950 px-3 py-3 text-sm leading-6 text-parchment outline-none transition-colors placeholder:text-zinc-600 focus:border-gold focus:ring-2 focus:ring-gold/30"
          onChange={(event) => onChange({ ...identity, bio: event.target.value })}
        />
      </label>
    </div>
  );
}

function CalibrationStep({
  quiz,
  onChange,
}: {
  quiz: OnboardingQuiz;
  onChange: (next: OnboardingQuiz) => void;
}) {
  function setPrompt(id: PolicyPromptId, value: number) {
    onChange({ ...quiz, [id]: value });
  }

  return (
    <div className="mt-10 space-y-6">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
          {STEPS[1].eyebrow}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-parchment">
          {STEPS[1].title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Five-point scale on each issue, from Strongly Oppose to Strongly Support. The
          scores become your ideological vector.
        </p>
      </header>

      <div className="space-y-4">
        {CORE_POLICY_PROMPTS.map((prompt) => (
          <PolicySlider
            key={prompt.id}
            topic={prompt.topic}
            prompt={prompt.prompt}
            value={quiz[prompt.id]}
            onChange={(value) => setPrompt(prompt.id, value)}
          />
        ))}
      </div>
    </div>
  );
}

function PolicySlider({
  topic,
  prompt,
  value,
  onChange,
}: {
  topic: string;
  prompt: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const track = useMemo(() => goldTrack(value), [value]);

  return (
    <div className="rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">{topic}</p>
      <p className="mt-2 text-sm leading-6 text-parchment">{prompt}</p>
      <div className="mt-5 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Position
        </p>
        <p className="font-display text-sm font-semibold tracking-tight text-gold">
          {likertLabel(value)}
        </p>
      </div>
      <input
        type="range"
        min={LIKERT_MIN}
        max={LIKERT_MAX}
        step={1}
        value={value}
        aria-label={prompt}
        aria-valuemin={LIKERT_MIN}
        aria-valuemax={LIKERT_MAX}
        aria-valuenow={value}
        aria-valuetext={likertLabel(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="ideology-slider mt-4"
        style={{ background: track }}
      />
      <div className="mt-3 flex justify-between gap-1 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        {LIKERT_POINTS.map((point) => (
          <span
            key={point.value}
            className={cn(
              "max-w-[4.5rem] text-center leading-4",
              point.value === value && "text-gold",
            )}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PacStep({
  accepted,
  onChange,
  name,
}: {
  accepted: boolean;
  onChange: (next: boolean) => void;
  name: string;
}) {
  return (
    <div className="mt-10 space-y-6">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
          {STEPS[2].eyebrow}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-parchment">
          {STEPS[2].title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{STEPS[2].description}</p>
      </header>

      <div className="rounded-xl border border-gold/50 bg-zinc-900 p-6 text-sm leading-6 text-zinc-300 shadow-[inset_3px_0_0_0_var(--gold-strong)]">
        <p className="font-display text-base font-semibold text-parchment">
          WHERE 2 RUN Conduit PAC
        </p>
        <p className="mt-4">
          Supporters vault a card behind {name.trim() || "your campaign"} through the
          Conduit PAC. Funds stay authorized, not captured, until you file for the
          office on this ticket. Off-session capture happens only after ballot access.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5">
          <li>Pledges are SetupIntent vaults. They are not campaign contributions until capture.</li>
          <li>Capture is conditional on filing. If you do not file, the authorization expires.</li>
          <li>You authorize WHERE 2 RUN to transmit conduit disbursements to your campaign committee.</li>
        </ul>
        <p className="mt-4 text-[11px] uppercase tracking-widest text-zinc-500">
          Paid for by WHERE 2 RUN Conduit PAC. Not authorized by any candidate or
          candidate&apos;s committee until filing.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gold/40 bg-zinc-950 px-4 py-4">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 h-4 w-4 accent-gold"
        />
        <span className="text-sm leading-6 text-parchment">
          I accept the Conduit PAC agreement and authorize vaulted pledges to capture
          when I file for this office.
        </span>
      </label>
    </div>
  );
}
