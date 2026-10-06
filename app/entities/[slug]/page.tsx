import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { platformAdmin } from "@/lib/platform/records";

export const dynamic = "force-dynamic";

type EntityPage = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  summary: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} · Entity · WHERE 2 RUN` };
}

export default async function EntityProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = platformAdmin();
  const loaded = await admin
    .from("entities")
    .select("id, slug, name, kind, summary")
    .eq("slug", slug)
    .maybeSingle();
  if (loaded.error) {
    const message = isMissingSchema(loaded.error)
      ? "Apply the phase 2 migration, then reload."
      : loaded.error.message;
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="text-sm text-zinc-600">{message}</p>
      </main>
    );
  }
  const entity = loaded.data as EntityPage | null;
  if (!entity) notFound();

  const [endorsements, prompts] = await Promise.all([
    admin
      .from("entity_endorsements")
      .select("id, candidate_id, statement, created_at")
      .eq("entity_id", entity.id)
      .order("created_at", { ascending: false }),
    admin
      .from("community_prompts")
      .select("id, title, content")
      .eq("entity_id", entity.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col bg-stone-50 px-6 py-10 text-zinc-900">
      <p className="text-[11px] uppercase tracking-[0.2em] text-amber-700">
        {entity.kind === "union" ? "Union" : "PAC"}
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">{entity.name}</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600">{entity.summary}</p>
      <p className="mt-4 text-sm leading-6 text-zinc-600">
        This profile is view-only. The organization can endorse candidates and file prompts on the
        Agenda Queue. It does not debate.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Endorsements</h2>
        {(endorsements.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">No endorsements filed.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {(endorsements.data as { id: string; candidate_id: string; statement: string }[]).map(
              (row) => (
                <li key={row.id} className="rounded-xl border border-amber-500/30 bg-white px-4 py-4">
                  <Link href={`/profile/${row.candidate_id}`} className="text-sm font-medium text-amber-800">
                    Candidate profile
                  </Link>
                  <p className="mt-2 text-sm leading-6">{row.statement}</p>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Agenda prompts</h2>
        {prompts.error || (prompts.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">No prompts filed.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {(prompts.data as { id: string; title: string; content: string }[]).map((row) => (
              <li key={row.id} className="rounded-xl border border-amber-500/30 bg-white px-4 py-4">
                <p className="font-medium">{row.title}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{row.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
