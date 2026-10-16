import Link from "next/link";
import { LIKERT_CHOICES, type LikertChoice, type WedgeCard } from "@/lib/townhall/calibration";
import { cn } from "@/lib/utils";

type Phase = "in" | "out";

export function CalibrationCard({
  card,
  phase,
  filed,
  busyChoice,
  error,
  onAnswer,
  onSkip,
}: {
  card: WedgeCard | null;
  phase: Phase;
  filed: boolean;
  busyChoice: LikertChoice | "skip" | null;
  error: string | null;
  onAnswer: (choice: LikertChoice) => void;
  onSkip: () => void;
}) {
  if (!card) {
    return (
      <article
        className={cn(
          "rounded-2xl border border-amber-500/30 bg-white px-5 py-6",
          phase === "out" ? "townhall-card-out" : "townhall-card-in",
        )}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700">Calibration pass</p>
        <h2 className="mt-3 font-display text-lg font-semibold text-stone-900">
          {filed ? "This pass is filed" : "This pass was skipped"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {filed
            ? "Townhall confidence stops at 96%. A live district debate can still close the rest."
            : "Skip Topic leaves the vector where it is. Come back when you want to move it."}
        </p>
        <Link
          href="/debates"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-stone-900 px-5 text-[11px] font-semibold uppercase tracking-widest text-stone-50"
        >
          Enter a district debate
        </Link>
      </article>
    );
  }

  return (
    <article
      key={card.id}
      aria-live="polite"
      className={cn(
        "rounded-2xl border border-amber-500/30 bg-white px-5 py-5",
        phase === "out" ? "townhall-card-out" : "townhall-card-in",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700">{card.context}</p>
      <h2 className="mt-3 font-serif text-xl leading-relaxed text-stone-900">{card.prompt}</h2>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Your position">
        {LIKERT_CHOICES.map((choice) => {
          const pending = busyChoice === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              disabled={busyChoice != null}
              onClick={() => onAnswer(choice.id)}
              className={cn(
                "inline-flex h-12 items-center justify-center rounded-md border px-2 text-center text-[11px] font-semibold uppercase tracking-widest transition-colors disabled:cursor-wait disabled:opacity-60",
                pending
                  ? "border-amber-500 bg-amber-500 text-stone-950"
                  : "border-amber-500/40 bg-white text-stone-900 hover:border-amber-500 hover:bg-amber-50",
              )}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onSkip}
        disabled={busyChoice != null}
        className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-md border border-stone-300 bg-stone-50 text-[11px] font-semibold uppercase tracking-widest text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-900 disabled:cursor-wait disabled:opacity-60"
      >
        Skip Topic
      </button>
      {error ? (
        <p className="mt-4 text-sm leading-6 text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
