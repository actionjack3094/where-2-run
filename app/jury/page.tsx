import type { Metadata } from "next";
import Link from "next/link";
import { JuryDesk, type JuryCaseView } from "@/app/jury/jury-desk";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import { isMissingSchema } from "@/lib/db/schema-errors";

export const metadata: Metadata = {
  title: "Jury · WHERE 2 RUN",
  description:
    "Review flagged ballots and abandoned debates before the nightly job finalizes ELO.",
};

export default async function JuryPage() {
  const user = await getServerUser().catch(() => null);
  let cases: JuryCaseView[] = [];
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("arbitration_cases")
      .select("id, debate_id, kind, opened_at")
      .eq("status", "open")
      .order("opened_at", { ascending: true })
      .limit(50);

    if (error) {
      loadError = isMissingSchema(error)
        ? "Apply the production expansion migration before the jury queue can open."
        : error.message;
    } else {
      const debateIds = [...new Set((data ?? []).map((row) => row.debate_id))];
      const topics = new Map<string, string>();
      if (debateIds.length > 0) {
        const { data: debates } = await admin
          .from("debates")
          .select("id, topic")
          .in("id", debateIds);
        for (const debate of debates ?? []) topics.set(debate.id, debate.topic);
      }
      cases = (data ?? []).map((row) => ({
        id: row.id,
        debateId: row.debate_id,
        topic: topics.get(row.debate_id) || "Untitled floor",
        kind: row.kind,
        openedAt: row.opened_at,
      }));
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not open the jury queue.";
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Arbitration
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Jury queue
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Open holds block the nightly cron from writing ELO. Uphold a flagged ballot to
            void that vote, or uphold a bad-faith floor to expire it with no rating change.
            Dismiss releases the hold.
          </p>
        </header>

        {!user ? (
          <Link
            href="/auth/login"
            className="mt-6 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
          >
            Sign in to vote on a case
          </Link>
        ) : null}

        {loadError ? <p className="mt-8 text-sm leading-6 text-zinc-400">{loadError}</p> : null}
        {!loadError ? <JuryDesk cases={cases} /> : null}
      </div>
    </main>
  );
}
