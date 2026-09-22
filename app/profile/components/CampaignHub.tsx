"use client";

import Link from "next/link";
import { treasurerFilingLink } from "@/lib/compliance/treasurer";
import { ideologicalCompatibilityPercent } from "@/lib/ideology/six-axis";
import { formatUsd } from "@/lib/pledges";
import type { CoalitionContact, ProfileHubData } from "@/lib/profile/hub";

export function CampaignHub({ profile }: { profile: ProfileHubData }) {
  const filing = profile.election
    ? treasurerFilingLink({
        level: profile.election.level,
        state: profile.election.state,
      })
    : null;
  const total = profile.bounties.reduce((sum, bounty) => sum + bounty.amount, 0);
  const network = [...profile.network].sort((left, right) => {
    if (left.role !== right.role) return left.role === "ally" ? -1 : 1;
    const leftScore = ideologicalCompatibilityPercent(
      profile.ideologyVector,
      left.ideologyVector,
    );
    const rightScore = ideologicalCompatibilityPercent(
      profile.ideologyVector,
      right.ideologyVector,
    );
    return (rightScore ?? -1) - (leftScore ?? -1);
  });

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
      </section>

      <section aria-labelledby="appoint-treasurer-heading">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Compliance dossier
        </p>
        <h2
          id="appoint-treasurer-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Appoint Treasurer
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          {profile.election
            ? `File the treasurer appointment for ${profile.election.officeName} before this campaign accepts contributions.`
            : "Match an election before the treasurer form for this campaign can be chosen."}
        </p>

        {profile.election ? (
          <p className="mt-4 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            {profile.election.level} · {profile.election.state ?? "State unpublished"}
          </p>
        ) : null}

        {filing ? (
          <a
            href={filing.href}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-md bg-gold-strong px-5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-zinc-950 transition-colors hover:bg-gold"
          >
            {filing.label}
          </a>
        ) : (
          <p className="mt-6 max-w-xl text-sm leading-6 text-zinc-400">
            {profile.election
              ? "Appoint a campaign treasurer with this state's filing office before the campaign accepts contributions."
              : "Once a seat is matched, the federal or Texas filing link appears here."}
          </p>
        )}
        {filing ? (
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">{filing.detail}</p>
        ) : null}
      </section>

      <section aria-labelledby="coalition-network-heading">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Coalition network
        </p>
        <h2
          id="coalition-network-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Followers and endorsed allies
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Compatibility is the closeness of each person&apos;s ideology vector to
          this campaign.
        </p>

        {network.length === 0 ? (
          <p className="mt-8 text-sm leading-6 text-zinc-400">
            No followers or endorsed allies on this campaign yet.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {network.map((person) => (
              <NetworkRow
                key={`${person.role}-${person.id}`}
                person={person}
                ideologyVector={profile.ideologyVector}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NetworkRow({
  person,
  ideologyVector,
}: {
  person: CoalitionContact;
  ideologyVector: number[];
}) {
  const compatibility = ideologicalCompatibilityPercent(
    ideologyVector,
    person.ideologyVector,
  );

  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-gold/40 bg-zinc-900 px-5 py-4">
      <div className="min-w-0">
        <Link
          href={`/profile/${person.id}`}
          className="block truncate font-medium text-parchment hover:text-gold"
        >
          {person.name}
        </Link>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          {person.role === "ally" ? "Endorsed ally" : "Follower"}
        </p>
      </div>
      <p className="shrink-0 text-right">
        <span className="block font-display text-xl font-semibold tabular-nums text-gold">
          {compatibility == null ? "—" : `${compatibility}%`}
        </span>
        <span className="mt-1 block text-[10px] font-medium uppercase tracking-widest text-zinc-500">
          Compatibility
        </span>
      </p>
    </li>
  );
}
