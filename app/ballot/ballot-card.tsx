import Link from "next/link";
import { BallotReactions } from "@/app/ballot/ballot-reactions";
import { StandingBadge } from "@/app/ballot/standing-badge";
import { SupportPledgeButton } from "@/app/ballot/support-pledge";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import type { BallotDebateCard, BallotFeedCard, BallotPerson, BallotStatementCard } from "@/lib/ballot/load-district-feed";

const sans = { fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" };

export function BallotCard({ card, signedIn }: { card: BallotFeedCard; signedIn: boolean }) {
  if (card.kind === "debate") return <DebateCard card={card} signedIn={signedIn} />;
  return <StatementCard card={card} signedIn={signedIn} />;
}

function DebateCard({ card, signedIn }: { card: BallotDebateCard; signedIn: boolean }) {
  return (
    <article className="border-b border-stone-200 px-4 py-5" data-ballot-kind="debate" data-debate-id={card.id}>
      <h2 className="text-[15px] font-semibold leading-6 text-stone-900" style={sans}>
        {card.question}
      </h2>
      <p className="mt-1 text-xs font-medium uppercase tracking-widest text-stone-500">{card.officeTag}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <PersonColumn person={card.sideA} signedIn={signedIn} />
        <PersonColumn person={card.sideB} signedIn={signedIn} />
      </div>
      <BallotReactions
        upvotes={card.upvotes}
        resonance={card.resonance}
        questionCount={card.questionCount}
        href={card.href}
      />
    </article>
  );
}

function StatementCard({ card, signedIn }: { card: BallotStatementCard; signedIn: boolean }) {
  return (
    <article className="border-b border-stone-200 px-4 py-5" data-ballot-kind="statement">
      <PersonHeader person={card.author} />
      <p className="mt-1 text-xs font-medium uppercase tracking-widest text-stone-500">{card.officeTag}</p>
      <p className="mt-3 text-[15px] leading-6 text-stone-800">{card.text}</p>
      <SupportPledgeButton
        candidateId={card.author.id}
        candidateName={card.author.name}
        primaryId={card.author.primaryId}
        pledged={card.author.pledged}
        signedIn={signedIn}
      />
      <BallotReactions
        upvotes={card.upvotes}
        resonance={card.resonance}
        questionCount={null}
        href={card.debateHref}
      />
    </article>
  );
}

function PersonColumn({ person, signedIn }: { person: BallotPerson; signedIn: boolean }) {
  return (
    <div className="min-w-0">
      <PersonHeader person={person} />
      <p className="mt-2 text-[13px] leading-5 text-stone-700">{person.excerpt}</p>
      <SupportPledgeButton
        candidateId={person.id}
        candidateName={person.name}
        primaryId={person.primaryId}
        pledged={person.pledged}
        signedIn={signedIn}
      />
    </div>
  );
}

function PersonHeader({ person }: { person: BallotPerson }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <CandidateAvatar name={person.name} avatarUrl={person.avatarUrl} size="sm" />
        <Link href={`/profile/${person.id}`} className="truncate text-sm font-semibold text-stone-900 hover:text-amber-800">
          {person.name}
        </Link>
      </div>
      <div className="mt-2">
        <StandingBadge filed={person.filed} />
      </div>
    </div>
  );
}
