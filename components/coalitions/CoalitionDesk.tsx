"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  acceptCoalitionInvite,
  createCoalition,
  inviteToCoalition,
  loadMyCoalitionInbox,
} from "@/app/actions/coalitions";
import { CoalitionBadge } from "@/components/coalitions/CoalitionBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ensureArenaUser } from "@/lib/arena/identity";
import {
  ALIGNMENT_FLOOR,
  COALITION_CHARTER_MAX,
  COALITION_CHARTER_MIN,
  COALITION_NAME_MAX,
  canInviteTo,
  formatAlignment,
  isActiveMember,
  loadCoalitionDirectory,
  membershipFor,
  parseStanceVector,
  rankAlignedCandidates,
  rankRecommendedCoalitions,
  statusLabel,
  type CandidateBrief,
  type CoalitionDeskItem,
  type CoalitionDirectory,
  type MemberSeat,
} from "@/lib/coalitions";
import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { CoalitionMember } from "@/types/database.types";

type DeskStage = "booting" | "ready" | "error";

function sessionVector() {
  if (typeof window === "undefined") return [];
  return parseStanceVector(window.sessionStorage.getItem(STORAGE_KEYS.vector));
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function mergeSeats(coalition: CoalitionDeskItem, extras: CoalitionMember[]): CoalitionDeskItem {
  const extraSeats: MemberSeat[] = extras
    .filter((row) => row.coalition_id === coalition.id)
    .filter((row) => !coalition.members.some((seat) => seat.id === row.id))
    .map((row) => ({ ...row, candidate: null }));
  if (extraSeats.length === 0) return coalition;
  return { ...coalition, members: [...coalition.members, ...extraSeats] };
}

function SubmitButton({
  label,
  pendingLabel,
  variant = "gold",
}: {
  label: string;
  pendingLabel: string;
  variant?: "gold" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" className="w-fit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function CoalitionDesk({ directory }: { directory: CoalitionDirectory }) {
  const router = useRouter();
  const [stage, setStage] = useState<DeskStage>("booting");
  const [desk, setDesk] = useState(directory);
  const [error, setError] = useState<string | null>(directory.error);
  const [banner, setBanner] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [viewerVector, setViewerVector] = useState<number[]>([]);
  const [viewerDistrictId, setViewerDistrictId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<CoalitionMember[]>([]);
  const [outstanding, setOutstanding] = useState<CoalitionMember[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const refreshInbox = useCallback(async () => {
    await ensureArenaUser();
    const token = await accessToken();
    const inbox = await loadMyCoalitionInbox(token);
    setUserId(inbox.userId);
    setMemberships(inbox.memberships);
    setOutstanding(inbox.outstanding);
    setViewerDistrictId(inbox.targetDistrictId);
    const persisted = parseStanceVector(inbox.ideologyVector);
    setViewerVector(persisted.length > 0 ? persisted : sessionVector());
  }, []);

  const reloadDesk = useCallback(async () => {
    const next = await loadCoalitionDirectory();
    setDesk(next);
    if (next.error) setError(next.error);
  }, []);

  useEffect(() => {
    setDesk(directory);
  }, [directory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshInbox();
        if (!cancelled) setStage("ready");
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not open the coalition desk.");
          setStage("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshInbox]);

  const coalitions = useMemo(() => {
    const extras = [...memberships, ...outstanding];
    return desk.coalitions.map((coalition) => mergeSeats(coalition, extras));
  }, [desk.coalitions, memberships, outstanding]);

  const candidateById = useMemo(
    () => new Map(desk.candidates.map((row) => [row.id, row])),
    [desk.candidates],
  );

  const pendingInvites = useMemo(
    () =>
      coalitions.filter((coalition) => membershipFor(coalition, userId)?.status === "pending"),
    [coalitions, userId],
  );

  const activeAlliances = useMemo(
    () => coalitions.filter((coalition) => isActiveMember(coalition, userId)),
    [coalitions, userId],
  );

  const recommended = useMemo(
    () => rankRecommendedCoalitions(userId ?? "", viewerVector, coalitions).slice(0, 6),
    [coalitions, userId, viewerVector],
  );

  async function runAction(key: string, work: () => Promise<void>) {
    setBusyId(key);
    setError(null);
    setBanner(null);
    try {
      await ensureArenaUser();
      await work();
      await Promise.all([reloadDesk(), refreshInbox()]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The coalition action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(formData: FormData) {
    const name = String(formData.get("name") ?? "");
    const charter = String(formData.get("charter") ?? "");
    await runAction("create", async () => {
      await createCoalition(name, charter, await accessToken());
      setBanner("Coalition chartered. Invite aligned campaigns to seat the caucus.");
      setFormKey((current) => current + 1);
    });
  }

  async function handleAccept(coalitionId: string) {
    await runAction(`accept-${coalitionId}`, async () => {
      await acceptCoalitionInvite(coalitionId, await accessToken());
      setBanner("Endorsement seated. The coalition now carries your name.");
    });
  }

  async function handleInvite(coalitionId: string, candidateId: string) {
    await runAction(`invite-${coalitionId}-${candidateId}`, async () => {
      await inviteToCoalition(coalitionId, candidateId, await accessToken());
      setBanner("Cross-district endorsement sent.");
    });
  }

  if (stage === "booting") {
    return (
      <p className="mt-10 text-sm leading-6 text-zinc-400">
        Opening the coalition desk against your stance vector…
      </p>
    );
  }

  if (stage === "error" && !userId) {
    return (
      <Card className="mt-10">
        <CardHeader>
          <CardTitle>Desk unavailable</CardTitle>
          <CardDescription>{error ?? "Sign in from My Campaign, then return to charter an alliance."}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="mt-10 flex flex-col gap-14">
      {error ? (
        <p className="text-sm leading-6 text-red-300/90" role="alert">
          {error}
        </p>
      ) : null}
      {banner ? (
        <p className="text-sm leading-6 text-gold" role="status">
          {banner}
        </p>
      ) : null}

      <CreateCoalitionForm key={formKey} onCreate={handleCreate} />

      <section>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Outstanding
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
          Pending endorsements
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Accept a seat to bind your campaign to that charter.
        </p>
        {pendingInvites.length === 0 ? (
          <p className="mt-6 text-sm leading-6 text-zinc-500">
            No pending invites. Aligned tickets will land here.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {pendingInvites.map((coalition) => (
              <article
                key={coalition.id}
                className="rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CoalitionBadge name={coalition.name} />
                    <p className="mt-3 text-sm leading-6 text-zinc-400">
                      {coalition.charter_statement}
                    </p>
                    <p className="mt-2 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      Founded by {coalition.founder?.username ?? "unknown"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="gold"
                    size="sm"
                    className="shrink-0"
                    disabled={busyId === `accept-${coalition.id}`}
                    onClick={() => void handleAccept(coalition.id)}
                  >
                    {busyId === `accept-${coalition.id}` ? "Seating…" : "Accept invite"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Alliances
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
          Active coalitions
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Manage seated members and send cross-district endorsements to aligned campaigns.
        </p>
        {activeAlliances.length === 0 ? (
          <p className="mt-6 text-sm leading-6 text-zinc-500">
            You are not seated in a coalition yet. Charter one above, or accept an invite.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {activeAlliances.map((coalition) => (
              <ManagedCoalition
                key={coalition.id}
                coalition={coalition}
                viewerId={userId}
                viewerVector={viewerVector}
                viewerDistrictId={viewerDistrictId}
                candidates={desk.candidates}
                candidateById={candidateById}
                busyId={busyId}
                onInvite={handleInvite}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Discovery
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
          Recommended coalitions
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Ranked by cosine alignment between your stance vector and each caucus centroid.
        </p>
        {viewerVector.length === 0 ? (
          <p className="mt-6 text-sm leading-6 text-zinc-500">
            Record stances on{" "}
            <Link href="/my-campaign" className="text-gold hover:text-parchment">
              My Campaign
            </Link>{" "}
            so we can match you to a charter.
          </p>
        ) : recommended.length === 0 ? (
          <p className="mt-6 text-sm leading-6 text-zinc-500">
            No open coalitions sit close to your vector. Charter one and invite the field.
          </p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {recommended.map((coalition) => {
              const pending = membershipFor(coalition, userId)?.status === "pending";
              return (
                <Card key={coalition.id}>
                  <CardHeader>
                    <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                      {formatAlignment(coalition.alignmentPct)}
                    </p>
                    <CardTitle className="font-display text-lg text-parchment">
                      {coalition.name}
                    </CardTitle>
                    <CardDescription>{coalition.charter_statement}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      {coalition.members.filter((seat) => seat.status === "active").length} seated
                      {pending ? " · invite pending" : ""}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function CreateCoalitionForm({
  onCreate,
}: {
  onCreate: (formData: FormData) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
          Charter
        </p>
        <CardTitle className="font-display text-lg text-parchment">
          Found a coalition
        </CardTitle>
        <CardDescription>
          Name the alliance and publish a charter. You are seated as founder; invite campaigns
          from other districts to endorse it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onCreate} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Coalition name
            </span>
            <input
              name="name"
              required
              minLength={2}
              maxLength={COALITION_NAME_MAX}
              placeholder="Municipal Reform Caucus"
              className="h-10 rounded-md border border-gold/40 bg-zinc-950 px-3 text-sm text-parchment outline-none placeholder:text-zinc-600 focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Charter statement
            </span>
            <textarea
              name="charter"
              required
              minLength={COALITION_CHARTER_MIN}
              maxLength={COALITION_CHARTER_MAX}
              rows={4}
              placeholder="Declare the shared plank this coalition will defend across districts."
              className="rounded-md border border-gold/40 bg-zinc-950 px-3 py-2 text-sm leading-6 text-parchment outline-none placeholder:text-zinc-600 focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40"
            />
          </label>
          <SubmitButton label="Charter coalition" pendingLabel="Chartering…" />
        </form>
      </CardContent>
    </Card>
  );
}

function ManagedCoalition({
  coalition,
  viewerId,
  viewerVector,
  viewerDistrictId,
  candidates,
  candidateById,
  busyId,
  onInvite,
}: {
  coalition: CoalitionDeskItem;
  viewerId: string | null;
  viewerVector: number[];
  viewerDistrictId: string | null;
  candidates: CandidateBrief[];
  candidateById: Map<string, CandidateBrief>;
  busyId: string | null;
  onInvite: (coalitionId: string, candidateId: string) => Promise<void>;
}) {
  const active = coalition.members.filter((seat) => seat.status === "active");
  const pending = coalition.members.filter((seat) => seat.status === "pending");
  const occupied = new Set(coalition.members.map((seat) => seat.candidate_id));
  const reference = coalition.centroid.length > 0 ? coalition.centroid : viewerVector;
  const invitees = rankAlignedCandidates(
    viewerId ?? "",
    reference,
    viewerDistrictId,
    occupied,
    candidates,
  )
    .filter((row) => viewerVector.length === 0 || row.similarity >= ALIGNMENT_FLOOR)
    .slice(0, 5);

  if (!canInviteTo(coalition, viewerId)) return null;

  return (
    <article className="rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CoalitionBadge name={coalition.name} />
          <p className="mt-3 text-sm leading-6 text-zinc-400">{coalition.charter_statement}</p>
        </div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          {active.length} seated
        </p>
      </div>

      <ul className="mt-5 flex flex-col gap-2">
        {active.map((seat) => {
          const candidate = seat.candidate ?? candidateById.get(seat.candidate_id) ?? null;
          return (
            <li
              key={seat.id}
              className="flex items-center justify-between gap-3 rounded-md border border-gold/20 bg-zinc-950/60 px-3 py-2"
            >
              <Link
                href={`/profile/${seat.candidate_id}`}
                className="min-w-0 truncate font-display text-sm font-semibold text-parchment hover:text-gold"
              >
                {candidate?.username ?? "Unknown campaign"}
              </Link>
              <span className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-gold">
                {seat.candidate_id === coalition.founder_id ? "Founder" : statusLabel(seat.status)}
                {candidate?.district_name ? ` · ${candidate.district_name}` : ""}
              </span>
            </li>
          );
        })}
      </ul>

      {pending.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            Awaiting reply
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {pending.map((seat) => {
              const candidate = seat.candidate ?? candidateById.get(seat.candidate_id) ?? null;
              return (
                <li key={seat.id} className="text-sm text-zinc-400">
                  {candidate?.username ?? "Unknown campaign"}
                  {candidate?.district_name ? ` · ${candidate.district_name}` : ""}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 border-t border-gold/20 pt-5">
        <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
          Cross-district invites
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-500">
          Candidates closest to this charter&apos;s stance vector, with other districts ranked first.
        </p>
        {invitees.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            No aligned campaigns remain to invite.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {invitees.map((candidate) => {
              const key = `invite-${coalition.id}-${candidate.id}`;
              return (
                <li
                  key={candidate.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-gold/20 bg-zinc-950/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold text-parchment">
                      {candidate.username}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      {formatAlignment(candidate.alignmentPct)}
                      {candidate.crossDistrict ? " · Cross-district" : ""}
                      {candidate.district_name ? ` · ${candidate.district_name}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("shrink-0 text-[11px] uppercase tracking-widest")}
                    disabled={busyId === key}
                    onClick={() => void onInvite(coalition.id, candidate.id)}
                  >
                    {busyId === key ? "Sending…" : "Invite"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}
