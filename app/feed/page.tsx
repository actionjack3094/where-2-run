import { createServerClient } from "@supabase/auth-helpers-nextjs";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ChallengeButton } from "@/components/ChallengeButton";
import { TakeStanceModal } from "@/components/TakeStanceModal";
import type { MatchedFeedPost } from "@/types/database.types";

export const metadata: Metadata = {
  title: "My Ballot Feed · WHERE 2 RUN",
  description: "Stances matched to your district and ideology.",
};

function formatMatchPercent(similarity: number | string) {
  const value = typeof similarity === "string" ? Number(similarity) : similarity;
  if (!Number.isFinite(value)) return "— MATCH";
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}% MATCH`;
}

function postKey(post: MatchedFeedPost, index: number) {
  return post.post_id || post.id || `${post.claim}-${index}`;
}

export default async function FeedPage() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot persist refreshed auth cookies.
        }
      },
    },
  });

  const { data: posts } = await supabase.rpc("get_matched_feed", {
    viewer_embedding: "[0.5, -0.2, 0.8]",
    target_district: "Austin City Council - District 9",
    match_count: 10,
  });

  const feed = ((posts ?? []) as MatchedFeedPost[]).map((post) => ({
    ...post,
    id: post.id || post.post_id || "",
  }));

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Civic Feed
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
              My Ballot Feed
            </h1>
          </div>
          <TakeStanceModal />
        </header>

        {feed.length === 0 ? (
          <p className="mt-16 text-sm leading-6 text-zinc-400">
            No active stances in your district yet. Be the first!
          </p>
        ) : (
          <section className="mt-10 flex flex-col gap-4">
            {feed.map((post, index) => (
              <article
                key={postKey(post, index)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <h2 className="text-lg font-semibold leading-snug tracking-tight text-zinc-100">
                    {post.claim}
                  </h2>
                  <p className="shrink-0 font-mono text-xs font-medium uppercase text-blue-400">
                    {formatMatchPercent(post.similarity)}
                  </p>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-400">
                  {post.argument}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 px-3 text-xs font-medium uppercase tracking-widest text-zinc-100 transition-colors hover:bg-zinc-700"
                  >
                    Endorse
                  </button>
                  <ChallengeButton postId={post.id} />
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}