import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { createServerSupabase } from "@/lib/db/supabase-server";

export const metadata: Metadata = {
  title: "Notifications · WHERE 2 RUN",
  description: "Active debates you are seated in.",
};

type ActiveDebateNotice = {
  id: string;
  topic: string;
  election_question_id: string | null;
};

function debatePreview(debate: ActiveDebateNotice) {
  const topic = debate.topic.trim();
  if (topic) return topic;
  if (debate.election_question_id) return debate.election_question_id;
  return debate.id;
}

export default async function NotificationsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let debates: ActiveDebateNotice[] = [];
  let errorMessage: string | null = null;

  if (user) {
    const { data, error } = await supabase
      .from("debates")
      .select("id, topic, election_question_id")
      .eq("status", "active")
      .or(`candidate_a_id.eq.${user.id},candidate_b_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      errorMessage = error.message;
    } else {
      debates = (data ?? []) as ActiveDebateNotice[];
    }
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-[0.18em] text-parchment">
            NOTIFICATIONS
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Challenges that are live. Open one to enter the arena.
          </p>
        </header>

        {!user ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            <Link href="/auth/login" className="text-gold hover:text-parchment">
              Sign in
            </Link>{" "}
            to see active debates you are seated in.
          </p>
        ) : errorMessage ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">{errorMessage}</p>
        ) : debates.length === 0 ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            No active debates right now.
          </p>
        ) : (
          <ul className="mt-10 flex flex-col gap-4">
            {debates.map((debate) => (
              <li key={debate.id}>
                <Link href={`/debates/${debate.id}`} className="block">
                  <Card className="transition-colors hover:border-gold hover:bg-zinc-900/80">
                    <CardContent className="px-5 py-5">
                      <p className="text-sm leading-6 text-parchment">
                        Challenge Accepted: You have an active debate on{" "}
                        {debatePreview(debate)}.
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
