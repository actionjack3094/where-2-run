"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fileJuryReport, resolveJuryCase } from "@/app/actions/jury/resolve-case";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/db/supabase";
import type { ReportReason, ReportTargetKind } from "@/types/database.types";

export type JuryCaseView = {
  id: string;
  debateId: string;
  topic: string;
  kind: string;
  openedAt: string;
};

const KINDS: ReportTargetKind[] = ["debate", "argument", "vote"];
const REASONS: ReportReason[] = ["bad_faith", "spam", "abandoned", "off_platform", "other"];

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function JuryDesk({ cases }: { cases: JuryCaseView[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [debateId, setDebateId] = useState("");
  const [targetKind, setTargetKind] = useState<ReportTargetKind>("debate");
  const [reason, setReason] = useState<ReportReason>("bad_faith");
  const [note, setNote] = useState("");

  async function decide(caseId: string, decision: "uphold" | "dismiss") {
    setPendingId(caseId);
    setError(null);
    try {
      await resolveJuryCase({ caseId, decision }, await accessToken());
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not close that case.");
    } finally {
      setPendingId(null);
    }
  }

  async function report() {
    setPendingId("report");
    setError(null);
    try {
      await fileJuryReport(
        { debateId, targetKind, reason, note },
        await accessToken(),
      );
      setNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not file that report.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mt-8 space-y-10">
      {cases.length === 0 ? (
        <p className="text-sm leading-6 text-zinc-400">
          No open holds. The nightly job can finalize ELO for debates that are not in this queue.
        </p>
      ) : (
        <ul className="space-y-4">
          {cases.map((item) => (
            <li key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
                {item.kind.replaceAll("_", " ")}
              </p>
              <p className="mt-2 text-sm leading-6 text-parchment">{item.topic}</p>
              <p className="mt-1 text-xs text-zinc-500">{item.debateId}</p>
              <div className="mt-4 flex gap-3">
                <Button
                  type="button"
                  variant="gold"
                  size="sm"
                  disabled={pendingId === item.id}
                  onClick={() => void decide(item.id, "uphold")}
                >
                  Uphold
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendingId === item.id}
                  onClick={() => void decide(item.id, "dismiss")}
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-4 border-t border-zinc-800 pt-8"
        onSubmit={(event) => {
          event.preventDefault();
          void report();
        }}
      >
        <h2 className="font-display text-xl text-parchment">File a report</h2>
        <p className="text-sm leading-6 text-zinc-400">
          Bad-faith arguments, spam ballots, and abandoned floors open a hold so ELO waits
          for this queue.
        </p>
        <input
          value={debateId}
          onChange={(event) => setDebateId(event.target.value)}
          placeholder="Debate id"
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-parchment"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <select
            value={targetKind}
            onChange={(event) => setTargetKind(event.target.value as ReportTargetKind)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-parchment"
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as ReportReason)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-parchment"
          >
            {REASONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What should the jury see?"
          className="min-h-24 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-parchment"
        />
        {error ? <p className="text-sm leading-6 text-red-300">{error}</p> : null}
        <Button type="button" variant="outline" disabled={pendingId === "report"} onClick={() => void report()}>
          {pendingId === "report" ? "Filing…" : "File report"}
        </Button>
      </form>
    </div>
  );
}
