"use client";

import { Lock } from "lucide-react";
import { CoalitionNetwork } from "@/app/profile/components/CoalitionNetwork";
import { EscrowVaultButton } from "@/app/profile/components/EscrowVaultModal";
import { treasurerFilingLink } from "@/lib/compliance/treasurer";
import { formatUsd } from "@/lib/pledges";
import type { ProfileHubData } from "@/lib/profile/hub";

export function CampaignHub({ profile }: { profile: ProfileHubData }) {
  const filing = profile.election
    ? treasurerFilingLink({
        slug: profile.election.slug,
        level: profile.election.level,
        state: profile.election.state,
      })
    : null;
  const total = profile.bounties.reduce((sum, bounty) => sum + bounty.amount, 0);

  return (
    <div className="mt-10 flex flex-col gap-14">
      <section aria-labelledby="escrow-unlock-heading">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Escrow
        </p>
        <h2
          id="escrow-unlock-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Unlock tracker
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Uncaptured draft bounties sitting on this campaign. Each card stays
          vaulted until its unlock condition clears.
        </p>

        <div className="mt-6 rounded-xl border border-gold/50 bg-zinc-900 px-5 py-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
            Uncaptured
          </p>
          <p className="mt-2 font-display text-4xl font-semibold tabular-nums tracking-tight text-gold">
            {formatUsd(total)}
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {profile.bounties.length === 0
              ? "No uncaptured draft bounties on this campaign yet."
              : `${profile.bounties.length} ${profile.bounties.length === 1 ? "bounty is" : "bounties are"} still locked.`}
          </p>
        </div>

        {profile.bounties.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {profile.bounties.map((bounty) => (
              <li
                key={bounty.id}
                className="rounded-xl border border-gold/40 bg-zinc-900 px-5 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                      Locked
                    </p>
                    <p className="mt-2 font-medium text-parchment">{bounty.donorName}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      Unlocks when: {bounty.unlockLabel}
                    </p>
                    {bounty.officeName ? (
                      <p className="mt-1 text-sm leading-6 text-zinc-500">{bounty.officeName}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 font-display text-xl font-semibold tabular-nums text-gold">
                    {formatUsd(bounty.amount)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
          <h3 className="font-display text-lg font-semibold tracking-tight text-parchment">
            Conditional bounty
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            {profile.election
              ? `Save a card for ${profile.election.officeName}. The platform charges it off-session when a candidate files for that seat.`
              : "Match a seat before vaulting a card. The charge runs when a candidate files."}
          </p>
          {profile.election ? (
            <EscrowVaultButton
              className="mt-5"
              electionId={profile.election.id}
              officeName={profile.election.officeName}
            />
          ) : null}
        </div>
      </section>

      <section aria-labelledby="compliance-ballot-heading">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Treasurer
        </p>
        <h2
          id="compliance-ballot-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Compliance & Ballot Access
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          {profile.election
            ? `File the treasurer appointment for ${profile.election.officeName} before this campaign can route escrowed funds.`
            : "Match an election to see the federal or Texas filing form for this campaign."}
        </p>

        {filing ? (
          <article className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
            <h3 className="font-display text-lg font-semibold tracking-tight text-parchment">
              {filing.cardTitle}
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">{filing.detail}</p>
            <a
              href={filing.href}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex h-12 items-center justify-center rounded-md bg-gold-strong px-5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-zinc-950 transition-colors hover:bg-gold"
            >
              {filing.label}
            </a>
          </article>
        ) : (
          <p className="mt-6 max-w-xl text-sm leading-6 text-zinc-400">
            {profile.election
              ? "This seat does not map to an FEC or Texas Ethics Commission treasurer form."
              : "Once a seat is matched, the federal or Texas filing link appears here."}
          </p>
        )}

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium text-parchment">Formally Appointed Treasurer</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                Locked for new candidates
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked="true"
              aria-disabled="true"
              disabled
              aria-label="Formally Appointed Treasurer, locked on"
              className="relative inline-flex h-7 w-12 shrink-0 cursor-not-allowed items-center rounded-full bg-gold-strong px-0.5"
            >
              <span className="inline-flex size-6 translate-x-5 items-center justify-center rounded-full bg-zinc-950 text-gold">
                <Lock className="size-3" aria-hidden />
              </span>
            </button>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            This box must be checked, and verified by the platform, before Stripe escrows can
            route to a campaign bank account.
          </p>
        </div>
      </section>

      <CoalitionNetwork candidateId={profile.userId} />
    </div>
  );
}
