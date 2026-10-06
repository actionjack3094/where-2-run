import type { Metadata } from "next";
import Link from "next/link";
import { SoapboxPost } from "@/app/soapbox/soapbox-post";
import { StumpComposer } from "@/app/soapbox/stump-composer";
import { loadSoapboxFeed } from "@/lib/actions/soapbox";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Soapbox · WHERE 2 RUN",
  description: "Post a stump speech and challenge a stance into the primaries you share.",
};

export default async function SoapboxPage() {
  const user = await getServerUser().catch(() => null);
  const feed = await loadSoapboxFeed(user?.id ?? null);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">Lane 1</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
            The Soapbox
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Say it in 280 characters. A same-party peer can challenge the speech into every primary you both contest.
          </p>
        </header>

        <div className="mt-8">
          <StumpComposer signedIn={Boolean(user)} />
        </div>

        {feed.missing ? (
          <p className="mt-8 text-sm leading-6 text-stone-600">
            Apply the Soapbox migration, then reload.
          </p>
        ) : null}
        {feed.error ? <p className="mt-8 text-sm leading-6 text-stone-600">{feed.error}</p> : null}

        {!feed.missing && !feed.error && feed.posts.length === 0 ? (
          <p className="mt-8 text-sm text-stone-600">
            No stump speeches yet.
            {user ? null : (
              <>
                {" "}
                <Link href="/auth/login?next=%2Fsoapbox" className="text-amber-800">
                  Sign in
                </Link>{" "}
                to post the first one.
              </>
            )}
          </p>
        ) : null}

        <div className="mt-8 grid gap-6">
          {feed.posts.map((post) => (
            <SoapboxPost key={post.id} post={post} viewerId={user?.id ?? null} />
          ))}
        </div>
      </div>
    </main>
  );
}
