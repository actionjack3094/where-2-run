import Link from "next/link";
import { ReportDebateButton } from "@/components/platform/ReportDebateButton";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { ClashReactionBar } from "@/app/debates/clash-reaction-bar";
import type { ClashCard as ClashCardData, ClashSide } from "@/lib/debates/clash-feed";
import { partyLabel, tierLabel } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

export function ClashCard({
  card,
  viewerId,
  featured = false,
}: {
  card: ClashCardData;
  viewerId: string | null;
  featured?: boolean;
}) {
  return (
    <article
      className="border-b border-stone-200 px-4 py-5"
      data-clash-id={card.id}
      data-featured={featured ? "true" : "false"}
      aria-label={`Debate: ${card.question}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-[15px] font-semibold leading-6 text-stone-900"
            style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
          >
            {card.question}
          </h2>
          <p className="mt-1 text-xs font-medium uppercase tracking-widest text-stone-500">{card.officeTag}</p>
        </div>
        <ReportDebateButton
          debateId={card.id}
          viewerId={viewerId}
          participants={[
            { id: card.sideA.id, name: card.sideA.name },
            { id: card.sideB.id, name: card.sideB.name },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <ClashSidePane side={card.sideA} />
        <ClashSidePane side={card.sideB} />
      </div>

      <ClashReactionBar
        upvotes={card.upvotes}
        resonance={card.resonance}
        questionCount={card.questionCount}
        href={card.href}
      />
    </article>
  );
}

function ClashSidePane({ side }: { side: ClashSide }) {
  const democrat = side.party === "democrat";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <CandidateAvatar name={side.name} avatarUrl={side.avatarUrl} size="sm" />
        <Link href={`/profile/${side.id}`} className="truncate text-sm font-semibold text-stone-900 hover:text-amber-800">
          {side.name}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest",
            democrat
              ? "border-blue-400/40 bg-blue-500/10 text-blue-800"
              : "border-red-400/40 bg-red-500/10 text-red-800",
          )}
        >
          {partyLabel(side.party)}
        </span>
        <span className="rounded-full border border-stone-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-stone-600">
          {tierLabel(side.tier)}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-5 text-stone-700">{side.excerpt}</p>
    </div>
  );
}
