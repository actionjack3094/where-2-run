export const CIVIC_STANDING_TIP =
  "An objective rating calculated by AI judges measuring how clearly a candidate defends policy trade-offs and adheres to their stated platform.";

export const IDEOLOGY_COMPASS_TIP =
  "Maps your exact fiscal and social philosophy based on AI-judged debate stances—not party labels.";

export const DISTRICT_AGENDA_TIP =
  "Verified district voters submit and upvote issues. Candidates must select from this list to debate.";

export const TOWN_HALL_TIP =
  "Vertical Q&A: Only verified district voters can ask questions, and only the candidates can answer. No peer-to-peer arguing.";

export const PLEDGED_ESCROW_TIP =
  "Dollars supporters have pledged into escrow. The funds stay vaulted until the campaign files and the release conditions are met.";

export const IDEOLOGY_VECTOR_TIP =
  "Your position on the economic and social axes. Only your own Townhall answers and your own debate scores move it.";

export function InfoTooltip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`About ${label}`}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-amber-500/40 text-[9px] font-semibold normal-case leading-none tracking-normal text-amber-800 transition-colors hover:border-amber-600 hover:text-amber-900"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-amber-500/30 bg-white px-3 py-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-stone-900 shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
