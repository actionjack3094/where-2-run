"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  createCoalition,
  endorseCandidate,
  joinCoalition,
  loadCoalitionDesk,
  withdrawEndorsement,
  type CoalitionDesk,
} from "@/lib/actions/coalitions";
import { CandidateIdentity } from "@/components/profile/CandidateAvatar";
import { CoalitionBadge } from "@/components/coalitions/CoalitionBadge";
import { Button } from "@/components/ui/button";
import {
  COALITION_CHARTER_MAX,
  COALITION_CHARTER_MIN,
  COALITION_NAME_MAX,
} from "@/lib/coalitions";
import { supabase } from "@/lib/db/supabase";

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The signed-in candidate's own coalition controls: current affiliation, open
 * invites, a form to charter a new coalition, and an endorsement desk for the
 * races they are running in. Everything is read from the database through
 * loadCoalitionDesk.
 */
export function CoalitionManager({ onChanged }: { onChanged?: () => void }) {
  const [desk, setDesk] = useState<CoalitionDesk | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const onChangedRef = useRef(onChanged);

  useEffect(() => {
    onChangedRef.current = onChanged;
  });

  const load = useCallback(async () => {
    const result = await loadCoalitionDesk(await accessToken());
    if (result.ok) {
      setDesk(result.desk);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(load)
      .catch(() => {
        if (!cancelled) setLoadError("We couldn't load your coalition.");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function run(
    key: string,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
  ) {
    if (busyKey) return false;
    setBusyKey(key);
    setActionError(null);
    setNotice(null);
    try {
      const result = await action();
      if (!result.ok) {
        setActionError(result.error);
        return false;
      }
      setNotice(success);
      await load();
      onChangedRef.current?.();
      return true;
    } catch {
      setActionError("Something went wrong. Please try again.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await run(
      "create",
      async () => createCoalition(name, description, await accessToken()),
      `Formed ${name.trim()}. You are its founder.`,
    );
    if (created) {
      setName("");
      setDescription("");
      setFormOpen(false);
    }
  }

  const descriptionLength = description.trim().length;
  const canCreate =
    name.trim().length >= 2 &&
    descriptionLength >= COALITION_CHARTER_MIN &&
    descriptionLength <= COALITION_CHARTER_MAX;

  return (
    <div className="mb-12 flex flex-col gap-10">
      {loadError ? (
        <p className="text-sm leading-6 text-rose-300" role="alert">
          {loadError}
        </p>
      ) : null}
      {actionError ? (
        <p className="text-sm leading-6 text-rose-300" role="alert">
          {actionError}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm leading-6 text-gold" role="status">
          {notice}
        </p>
      ) : null}

      <section aria-labelledby="coalition-affiliation-heading">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Active affiliation
        </p>
        <h3
          id="coalition-affiliation-heading"
          className="mt-3 font-display text-xl font-semibold tracking-tight text-parchment"
        >
          Your coalition
        </h3>

        {!desk && !loadError ? (
          <p className="mt-4 text-sm leading-6 text-zinc-400">Loading your coalition…</p>
        ) : null}

        {desk && desk.affiliations.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            You aren&apos;t seated in a coalition yet. Form one below, or accept an invite.
          </p>
        ) : null}

        {desk && desk.affiliations.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {desk.affiliations.map((coalition) => (
              <li
                key={coalition.coalitionId}
                className="rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <CoalitionBadge name={coalition.name} />
                  <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                    {coalition.role === "founder" ? "Founder" : "Member"} ·{" "}
                    {plural(coalition.memberCount, "member", "members")}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{coalition.charter}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {desk && desk.invites.length > 0 ? (
          <div className="mt-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Invitations
            </p>
            <ul className="mt-3 flex flex-col gap-3">
              {desk.invites.map((invite) => (
                <li
                  key={invite.coalitionId}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <CoalitionBadge name={invite.name} size="sm" />
                    <p className="mt-2 text-xs text-zinc-500">
                      {plural(invite.memberCount, "member", "members")} · invited you
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="gold"
                    size="sm"
                    disabled={busyKey !== null}
                    onClick={() =>
                      void run(
                        `join:${invite.coalitionId}`,
                        async () => joinCoalition(invite.coalitionId, await accessToken()),
                        `You joined ${invite.name}.`,
                      )
                    }
                  >
                    {busyKey === `join:${invite.coalitionId}` ? "Joining…" : "Join coalition"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6">
          {formOpen ? (
            <form
              onSubmit={(event) => void onCreate(event)}
              className="flex max-w-xl flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                  Coalition name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={COALITION_NAME_MAX}
                  required
                  className="h-11 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                  Description
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={COALITION_CHARTER_MAX}
                  rows={4}
                  required
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-6 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                />
                <span className="text-xs text-zinc-500">
                  {descriptionLength < COALITION_CHARTER_MIN
                    ? `At least ${COALITION_CHARTER_MIN} characters (${descriptionLength} so far). This becomes the public charter.`
                    : `${descriptionLength} / ${COALITION_CHARTER_MAX}. This becomes the public charter.`}
                </span>
              </label>
              <div className="flex gap-2">
                <Button type="submit" variant="gold" size="sm" disabled={!canCreate || busyKey !== null}>
                  {busyKey === "create" ? "Forming…" : "Form coalition"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyKey === "create"}
                  onClick={() => setFormOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(true)}>
              Form coalition
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="endorsement-desk-heading">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Endorsement desk
        </p>
        <h3
          id="endorsement-desk-heading"
          className="mt-3 font-display text-xl font-semibold tracking-tight text-parchment"
        >
          Candidates in your races
        </h3>

        {desk && desk.races.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Target a race to see the other candidates running in it.
          </p>
        ) : null}

        {desk?.races.map((race) => (
          <div key={race.electionId} className="mt-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
              {race.officeName}
            </p>
            {race.rivals.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                No other candidates are running in this race yet.
              </p>
            ) : (
              <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {race.rivals.map((rival) => {
                  const key = `endorse:${rival.id}`;
                  return (
                    <li
                      key={rival.id}
                      className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <CandidateIdentity id={rival.id} username={rival.username} />
                        <span className="shrink-0 text-right font-display text-2xl font-semibold tabular-nums text-gold">
                          {rival.eloRating}
                          <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                            ELO
                          </span>
                        </span>
                      </div>
                      {rival.endorsesMe ? (
                        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                          Endorses you
                        </p>
                      ) : null}
                      <Button
                        type="button"
                        variant={rival.endorsedByMe ? "outline" : "gold"}
                        size="sm"
                        className="w-fit"
                        aria-pressed={rival.endorsedByMe}
                        disabled={busyKey !== null}
                        onClick={() =>
                          void (rival.endorsedByMe
                            ? run(
                                key,
                                async () => withdrawEndorsement(rival.id, await accessToken()),
                                `Withdrew your endorsement of ${rival.username}.`,
                              )
                            : run(
                                key,
                                async () =>
                                  endorseCandidate(rival.id, race.electionId, await accessToken()),
                                `You endorsed ${rival.username}.`,
                              ))
                        }
                      >
                        {busyKey === key
                          ? "Saving…"
                          : rival.endorsedByMe
                            ? "Endorsed · Withdraw"
                            : rival.endorsesMe
                              ? "Endorse back"
                              : "Endorse"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
