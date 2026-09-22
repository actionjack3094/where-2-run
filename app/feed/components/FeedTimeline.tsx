"use client";

import Link from "next/link";
import { ChallengeButton } from "@/components/ChallengeButton";
import { VoterPostActions } from "@/components/feed/VoterPostActions";
import { CandidateIdentity } from "@/components/profile/CandidateAvatar";
import type { SocialFeedItem } from "@/lib/feed/types";
import type { VerificationTier } from "@/types/database.types";

function statusLabel(status: string) {
  if (status === "matching") return "Matching";
  if (status === "voting") return "Voting";
  if (status === "open") return "Open";
  return "Active";
}

export function FeedTimeline({
  items,
  viewerTier,
}: {
  items: SocialFeedItem[];
  viewerTier: VerificationTier;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-10 text-sm leading-6 text-zinc-400">
        No active debates or open stances yet. File one above to open the floor.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {items.map((item) => (
        <article
          key={`${item.kind}-${item.id}`}
          data-feed-role={item.kind === "debate" ? "voter" : "candidate"}
          className="rounded-xl border border-accent/60 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--accent)]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/40 bg-accent-muted px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-accent-ring">
              {item.kind === "debate" ? "Voter: District Watch" : "Stance"}
            </span>
            <span className="rounded-full border border-accent/30 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
              {statusLabel(item.status)}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {item.kind === "debate" ? (
              <Link href={`/debates/${item.id}`} className="min-w-0">
                <h2 className="text-lg font-semibold leading-snug tracking-tight text-parchment hover:text-accent-ring">
                  {item.title}
                </h2>
              </Link>
            ) : (
              <h2 className="text-lg font-semibold leading-snug tracking-tight text-parchment">
                {item.title}
              </h2>
            )}
            {item.electionSlug ? (
              <Link
                href={`/elections/${item.electionSlug}`}
                className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-accent-ring hover:text-gold"
              >
                {item.districtName}
              </Link>
            ) : (
              <p className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-accent-ring">
                {item.districtName}
              </p>
            )}
          </div>

          {item.kind === "debate" ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {item.candidateA ? (
                <CandidateIdentity
                  id={item.candidateA.id}
                  username={item.candidateA.username}
                  size="sm"
                  nameClassName="text-sm"
                />
              ) : (
                <span className="text-sm text-zinc-500">Open seat</span>
              )}
              <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                vs
              </span>
              {item.candidateB ? (
                <CandidateIdentity
                  id={item.candidateB.id}
                  username={item.candidateB.username}
                  size="sm"
                  nameClassName="text-sm"
                />
              ) : (
                <span className="text-sm text-zinc-500">Awaiting challenger</span>
              )}
            </div>
          ) : (
            <>
              {item.author ? (
                <div className="mt-4">
                  <CandidateIdentity
                    id={item.author.id}
                    username={item.author.username}
                    size="sm"
                    nameClassName="text-sm"
                  />
                </div>
              ) : null}
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-400">{item.body}</p>
            </>
          )}

          {item.kind === "debate" ? (
            <VoterPostActions
              debateId={item.id}
              candidateA={item.candidateA}
              candidateB={item.candidateB}
              votingOpen={item.votingOpen}
              verificationTier={viewerTier}
            />
          ) : (
            <div className="mt-5">
              <ChallengeButton postId={item.id} />
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
