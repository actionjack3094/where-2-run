import type { Metadata } from "next";
import Link from "next/link";
import { InboxList } from "@/app/components/InboxList";
import { getServerUser } from "@/lib/db/supabase-server";
import { loadInbox } from "@/lib/queries/inbox";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inbox · WHERE 2 RUN",
  description: "Pledges, debate challenges, jury appeals, and coalition alerts.",
};

export default async function InboxPage() {
  const user = await getServerUser();
  const inbox = user ? await loadInbox(user.id) : { items: [], unread: 0 };

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
            Notification center
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-[0.18em] text-parchment">
            INBOX
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Pledges, jury appeals, verdicts, and coalition invites land here as they happen.
          </p>
        </header>

        {!user ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            <Link href="/auth/login?next=/inbox" className="text-gold hover:text-parchment">
              Sign in
            </Link>{" "}
            to see alerts for your races.
          </p>
        ) : inbox.items.length === 0 ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            No alerts yet. When someone pledges to your campaign or appeals a debate, it will
            show up here.
          </p>
        ) : (
          <InboxList items={inbox.items} />
        )}
      </div>
    </main>
  );
}
