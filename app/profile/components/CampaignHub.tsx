"use client";

import { useEffect, useState, useTransition } from "react";
import { Lock, LockKeyhole } from "lucide-react";
import { declareCampaignTarget } from "@/lib/actions/campaign-targets";
import { requestDisbursement } from "@/lib/actions/disbursement";
import { CoalitionNetwork } from "@/app/profile/components/CoalitionNetwork";
import { EscrowVaultButton } from "@/app/profile/components/EscrowVaultModal";
import {
  formatStatutoryDate,
  relocationDeadlineIso,
  RESIDENCY_DISCLAIMER,
} from "@/lib/campaign/targets";
import { treasurerFilingLink } from "@/lib/compliance/treasurer";
import { supabase } from "@/lib/db/supabase";
import { formatUsd } from "@/lib/pledges";
import type { MatchedRace, ProfileHubData } from "@/lib/profile/hub";
import { cn } from "@/lib/utils";
import type { CampaignTargetStatus } from "@/types/database.types";

type TargetedRace = {
  id: string;
  status: CampaignTargetStatus | string;
  officeName: string;
  deadline: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  exploring: "Exploring",
  relocating: "Relocating",
  filed: "Filed",
};

const UNLOCK_STREAK = 10;

/** Always two decimals, so $50 reads as $50.00 on the vault. */
function usd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function CampaignHub({
  profile,
  onTargetsChanged,
}: {
  profile: ProfileHubData;
  onTargetsChanged?: () => void | Promise<void>;
}) {
  const filing = profile.election
    ? treasurerFilingLink({
        slug: profile.election.slug,
        level: profile.election.level,
        state: profile.election.state,
      })
    : null;
  const total = profile.bounties.reduce((sum, bounty) => sum + bounty.amount, 0);
  const [targets, setTargets] = useState<TargetedRace[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [targetsVersion, setTargetsVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: rows, error } = await supabase
        .from("campaign_targets")
        .select("id, election_id, status, created_at")
        .eq("user_id", profile.userId)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setTargetsError(error.message);
        setTargetsLoading(false);
        return;
      }

      const electionIds = [...new Set((rows ?? []).map((row) => row.election_id))];
      const elections =
        electionIds.length === 0
          ? { data: [], error: null }
          : await supabase
              .from("elections")
              .select("id, office_name, election_date, residency_requirement_days")
              .in("id", electionIds);

      if (cancelled) return;
      if (elections.error) {
        setTargetsError(elections.error.message);
        setTargetsLoading(false);
        return;
      }

      const byId = new Map((elections.data ?? []).map((election) => [election.id, election]));
      setTargets(
        (rows ?? []).map((row) => {
          const election = byId.get(row.election_id);
          const deadline = relocationDeadlineIso(
            election?.election_date,
            election?.residency_requirement_days,
          );
          return {
            id: row.id,
            status: row.status,
            officeName: election?.office_name ?? "Targeted race",
            deadline,
          };
        }),
      );
      setTargetsError(null);
      setTargetsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile.userId, targetsVersion]);

  async function handleTargeted() {
    setTargetsVersion((value) => value + 1);
    await onTargetsChanged?.();
  }

  return (
    <div className="mt-10 flex flex-col gap-14">
      <MatchedRaces
        races={profile.matchedRaces}
        candidateId={profile.userId}
        onTargeted={handleTargeted}
      />

      <section aria-labelledby="eligibility-roadmap-heading">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Targeting
        </p>
        <h2
          id="eligibility-roadmap-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Eligibility Roadmap
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Races on this campaign, with the date you would need to establish
          residency before election day.
        </p>

        {targetsLoading ? (
          <p className="mt-6 text-sm leading-6 text-zinc-400">Loading targeted races…</p>
        ) : targetsError ? (
          <p className="mt-6 text-sm leading-6 text-rose-300" role="alert">
            Could not load targeted races. {targetsError}
          </p>
        ) : targets.length === 0 ? (
          <p className="mt-6 text-sm leading-6 text-zinc-400">
            No targeted races yet. Target a race from your draft card or the contests
            board to open a residency roadmap.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {targets.map((race) => (
              <li key={race.id}>
                <EligibilityRoadmapCard race={race} />
              </li>
            ))}
          </ul>
        )}
      </section>

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

function EligibilityRoadmapCard({ race }: { race: TargetedRace }) {
  const status = STATUS_LABEL[race.status] ?? race.status;

  return (
    <article className="rounded-xl border border-gold/50 bg-zinc-900 px-5 py-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]">
      <p className="text-[11px] font-medium uppercase tracking-widest text-gold">{status}</p>
      <h3 className="mt-2 font-display text-xl font-semibold tracking-tight text-parchment">
        {race.officeName}
      </h3>
      <dl className="mt-4">
        <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Relocation Deadline
        </dt>
        <dd className="mt-1 font-display text-2xl font-semibold tracking-tight text-parchment">
          {race.deadline ? formatStatutoryDate(race.deadline) : "Unpublished"}
        </dd>
      </dl>
      <p className="mt-4 rounded-lg border border-gold bg-zinc-950 px-4 py-3 text-sm font-medium leading-6 text-gold">
        {RESIDENCY_DISCLAIMER}
      </p>
    </article>
  );
}

function MatchedRaces({
  races,
  candidateId,
  onTargeted,
}: {
  races: MatchedRace[];
  candidateId: string;
  onTargeted: () => void | Promise<void>;
}) {
  return (
    <section aria-labelledby="matched-races-heading">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Ballot</p>
      <h2
        id="matched-races-heading"
        className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
      >
        Matched Races
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Races that match your ideology. Target one to start building an alignment streak; ten
        unlocks locking the race in.
      </p>

      {races.length === 0 ? (
        <p className="mt-6 text-sm leading-6 text-zinc-400">
          No matched races yet. Finish calibrating your stance vector and your matched ballot
          will fill in here.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {races.map((race) => (
            <li key={race.electionId}>
              <MatchedRaceCard race={race} candidateId={candidateId} onTargeted={onTargeted} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MatchedRaceCard({
  race,
  candidateId,
  onTargeted,
}: {
  race: MatchedRace;
  candidateId: string;
  onTargeted: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targeting = race.targetId !== null;
  const streak = Math.min(race.alignmentStreak, UNLOCK_STREAK);
  const lockedIn = targeting && race.alignmentStreak >= UNLOCK_STREAK;

  async function target() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await declareCampaignTarget(race.electionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onTargeted();
    } catch {
      setError("We couldn't target that race. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={cn(
        "rounded-xl border bg-zinc-900 px-5 py-5",
        targeting
          ? "border-gold/50 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
          : "border-zinc-800",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] font-medium uppercase tracking-widest",
              targeting ? "text-gold" : "text-zinc-500",
            )}
          >
            {targeting
              ? lockedIn || race.isLocked
                ? "Locked"
                : (STATUS_LABEL[race.status ?? ""] ?? race.status)
              : (race.level ?? "Race")}
          </p>
          <h3 className="mt-2 font-display text-xl font-semibold tracking-tight text-parchment">
            {race.officeName}
          </h3>
        </div>

        {targeting ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void target()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-950 transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Targeting…" : "Target This Race"}
          </button>
        )}
      </div>

      {lockedIn ? (
        <div
          role="status"
          className="mt-4 flex items-start gap-3 rounded-lg border border-gold bg-zinc-950 px-4 py-4"
        >
          <LockKeyhole className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold uppercase tracking-[0.18em] text-gold">
              Locked In
            </p>
            <p className="mt-1 text-sm leading-6 text-parchment">
              Funds Released
              {race.escrow.available + race.escrow.disbursed > 0
                ? ` · ${usd(race.escrow.available + race.escrow.disbursed)}`
                : ""}
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              {race.alignmentStreak} straight aligned debates. Pledges waiting on the{" "}
              {UNLOCK_STREAK}-debate streak have been released.
            </p>
          </div>
        </div>
      ) : targeting ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Alignment streak
            </p>
            <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-parchment">
              {race.alignmentStreak}
              <span className="text-sm font-normal text-zinc-500"> / {UNLOCK_STREAK}</span>
            </p>
          </div>
          <div
            role="progressbar"
            aria-label={`${race.officeName} alignment streak`}
            aria-valuemin={0}
            aria-valuemax={UNLOCK_STREAK}
            aria-valuenow={streak}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
          >
            <div
              className="h-full rounded-full bg-gold-strong"
              style={{ width: `${(streak / UNLOCK_STREAK) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      {lockedIn ? (
        <CampaignVaultPanel
          candidateId={candidateId}
          electionId={race.electionId}
          officeName={race.officeName}
          escrow={race.escrow}
          onChanged={onTargeted}
        />
      ) : null}

      {error ? (
        <p className="mt-3 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

function CampaignVaultPanel({
  candidateId,
  electionId,
  officeName,
  escrow,
  onChanged,
}: {
  candidateId: string;
  electionId: string;
  officeName: string;
  escrow: MatchedRace["escrow"];
  onChanged: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const canRequest = escrow.available > 0;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function requestPayout() {
    if (pending || !canRequest) return;
    setError(null);

    startTransition(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const result = await requestDisbursement(
          candidateId,
          electionId,
          data.session?.access_token,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setToast(`Payout requested: ${usd(result.amount)} for ${officeName}.`);
        await onChanged();
      } catch {
        setError("We couldn't request that payout. Please try again.");
      }
    });
  }

  return (
    <section
      aria-label={`Campaign vault for ${officeName}`}
      className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4"
    >
      <h4 className="font-display text-base font-semibold tracking-tight text-parchment">
        Campaign Vault &amp; Disbursements
      </h4>

      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            Available balance
          </dt>
          <dd className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-gold">
            {usd(escrow.available)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            Locked in escrow
          </dt>
          <dd className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-parchment">
            {usd(escrow.locked)}
          </dd>
        </div>
      </dl>

      {escrow.disbursed > 0 ? (
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {usd(escrow.disbursed)} already paid out.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canRequest || pending}
          onClick={requestPayout}
          className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-950 transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Requesting…" : canRequest ? "Request Payout" : "No funds to pay out"}
        </button>
        <p className="text-xs leading-5 text-zinc-500">
          Mock payout. Connecting a payout account comes later; no money moves yet.
        </p>
      </div>

      {error ? (
        <p className="mt-3 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6"
        >
          <p className="rounded-full border border-gold bg-zinc-950 px-4 py-2 text-sm text-gold shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </section>
  );
}
