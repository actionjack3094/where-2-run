import Link from "next/link";
import { VolunteerTable } from "@/app/profile/settings/volunteers/volunteer-table";
import { loadDebaterQueue, loadSoapboxAnalytics } from "@/lib/campaign/hq";
import type { VolunteerSignupRow } from "@/lib/actions/campaign";

type Queue = Awaited<ReturnType<typeof loadDebaterQueue>>;
type Soapbox = Awaited<ReturnType<typeof loadSoapboxAnalytics>>;

export function QueuePanel({ queue, error }: { queue: Queue; error: string | null }) {
  return (
    <section className="mt-8">
      {error ? <p className="text-sm leading-6 text-stone-600">{error}</p> : null}
      {!error && queue.length === 0 ? (
        <p className="text-sm leading-6 text-stone-600">
          Nothing is waiting. Open a stance in Debates or accept a Soapbox challenge and it lands here.
        </p>
      ) : null}
      <ul className="grid gap-3">
        {queue.map((item) => (
          <li key={item.id}>
            <Link
              href={`/debates/${item.id}`}
              className="block rounded-xl border border-amber-500/30 bg-white px-5 py-4 transition-colors hover:border-gold/50"
            >
              <p className="text-[11px] uppercase tracking-widest text-amber-800">
                {item.role} · {item.office}
              </p>
              <p className="mt-2 text-sm font-medium text-stone-900">{item.prompt}</p>
              <p className="mt-1 text-sm text-stone-600">vs {item.opponent}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SoapboxPanel({ soapbox, error }: { soapbox: Soapbox | null; error: string | null }) {
  if (error) return <p className="mt-8 text-sm leading-6 text-stone-600">{error}</p>;
  if (!soapbox) return null;
  return (
    <section className="mt-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Speeches" value={String(soapbox.posts.length)} />
        <Stat label="Upvotes" value={soapbox.totalUpvotes.toLocaleString("en-US")} />
        <Stat
          label="Top tag"
          value={soapbox.tagCounts[0] ? `${soapbox.tagCounts[0].tag} · ${soapbox.tagCounts[0].count}` : "—"}
        />
      </div>
      {soapbox.posts.length === 0 ? (
        <p className="mt-6 text-sm leading-6 text-stone-600">
          <Link href="/soapbox" className="text-amber-800">
            Post a stump speech
          </Link>{" "}
          and the counts show up here.
        </p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {soapbox.posts.map((post) => (
            <li key={post.id} className="rounded-xl border border-amber-500/30 bg-white px-5 py-4">
              <p className="text-sm leading-6 text-stone-900">{post.content}</p>
              <p className="mt-2 text-[11px] uppercase tracking-widest text-stone-600">
                {post.upvotes.toLocaleString("en-US")} upvotes
                {post.tags.length > 0 ? ` · ${post.tags.join(" · ")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function VolunteerPanel({
  volunteers,
  error,
}: {
  volunteers: VolunteerSignupRow[];
  error: string | null;
}) {
  return (
    <section className="mt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-xl text-sm leading-6 text-stone-600">
          People who enlisted for this campaign. Districts come from each volunteer&apos;s ballot. The street
          address stays private.
        </p>
        {error || volunteers.length === 0 ? null : (
          <a
            href="/api/export/volunteers"
            className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-900"
          >
            Export to CSV
          </a>
        )}
      </div>
      {error ? <p className="mt-8 text-sm leading-6 text-stone-600">{error}</p> : <VolunteerTable rows={volunteers} />}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-white px-4 py-4">
      <p className="text-[11px] uppercase tracking-widest text-stone-600">{label}</p>
      <p className="mt-2 font-display text-2xl text-stone-900">{value}</p>
    </div>
  );
}
