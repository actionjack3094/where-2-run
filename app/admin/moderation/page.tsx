import type { Metadata } from "next";
import Link from "next/link";
import { ModerationQueue } from "@/app/admin/moderation/moderation-queue";
import { loadModerationQueue } from "@/lib/actions/moderation";
import { isMissingSchema } from "@/lib/db/schema-errors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Moderation · WHERE 2 RUN",
  description: "Review pending debate reports.",
};

export default async function ModerationPage() {
  let queue: Awaited<ReturnType<typeof loadModerationQueue>> | null = null;
  let setup: string | null = null;
  try {
    queue = await loadModerationQueue();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load reports.";
    setup = isMissingSchema({ message }) ? "Apply the civic moderation migration, then reload." : message;
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Civic moderation</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Reports
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Pending flags. Dismiss leaves the account on the arena. Ban User removes them and
            cancels their open seats.
          </p>
        </header>
        {setup ? <p className="mt-8 text-sm leading-6 text-zinc-300">{setup}</p> : null}
        {queue && !queue.allowed && queue.signedOut ? (
          <p className="mt-8 text-sm leading-6 text-zinc-300">
            <Link href="/auth/login?next=/admin/moderation" className="text-gold">
              Sign in
            </Link>{" "}
            to review reports.
          </p>
        ) : null}
        {queue && !queue.allowed && !queue.signedOut ? (
          <p className="mt-8 text-sm leading-6 text-zinc-300">{queue.message}</p>
        ) : null}
        {queue?.allowed ? <ModerationQueue flags={queue.flags} /> : null}
      </div>
    </main>
  );
}
