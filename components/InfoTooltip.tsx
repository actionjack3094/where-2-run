export const CIVIC_STANDING_TIP =
  "An objective rating calculated by AI judges measuring how clearly a candidate defends policy trade-offs and adheres to their stated platform.";

export const IDEOLOGY_COMPASS_TIP =
  "Maps your exact fiscal and social philosophy based on AI-judged debate stances—not party labels.";

export const DISTRICT_AGENDA_TIP =
  "Verified district voters submit and upvote issues. Candidates must select from this list to debate.";

export const TOWN_HALL_TIP =
  "Vertical Q&A: Only verified district voters can ask questions, and only the candidates can answer. No peer-to-peer arguing.";

export function InfoTooltip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 text-[10px] font-semibold normal-case leading-none tracking-normal text-zinc-400 transition-colors hover:border-gold hover:text-gold"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-zinc-200 shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
