import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { platformAdmin } from "@/lib/platform/records";
import type { AccountProfile } from "@/types/database.types";

export const dynamic = "force-dynamic";

type CandidatePageProps = { params: Promise<{ id: string }> };

const COLUMNS =
  "id, full_name, party, office, candidate_stage, ideology_x, ideology_y, voting_zip_code, district_votes, escrow_pledged, escrow_target";

function money(value: number | string | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

function axis(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

async function loadCandidate(id: string) {
  const admin = platformAdmin();
  const full = await admin.from("profiles").select(COLUMNS).eq("id", id).maybeSingle();
  if (!full.error) return (full.data as AccountProfile | null) ?? null;
  if (!isMissingSchema(full.error)) return null;
  const base = await admin
    .from("profiles")
    .select("id, full_name, ideology_x, ideology_y, voting_zip_code")
    .eq("id", id)
    .maybeSingle();
  return (base.data as AccountProfile | null) ?? null;
}

export async function generateMetadata({ params }: CandidatePageProps): Promise<Metadata> {
  const candidate = await loadCandidate((await params).id);
  const name = candidate?.full_name?.trim() || "Candidate";
  return {
    title: candidate ? `${name} · WHERE 2 RUN` : "Candidate · WHERE 2 RUN",
    description: candidate?.office?.trim() || "Public candidate profile on WHERE 2 RUN.",
  };
}

export default async function CandidatePage({ params }: CandidatePageProps) {
  const candidate = await loadCandidate((await params).id);
  if (!candidate) notFound();

  const name = candidate.full_name?.trim() || "Unnamed candidate";
  const pledged = Number(candidate.escrow_pledged ?? 0) || 0;
  const target = Number(candidate.escrow_target ?? 0) || 0;
  const progress = target > 0 ? Math.min(100, Math.round((pledged / target) * 100)) : 0;

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8">
        <article className="rounded-2xl border border-amber-200/70 bg-white p-6 shadow-sm">
          <header className="flex items-center gap-3">
            <CandidateAvatar name={name} size="md" />
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">{name}</h1>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-stone-500">
                {[candidate.party, candidate.office].filter(Boolean).join(" · ") || "Primary candidate"}
              </p>
            </div>
          </header>
          {candidate.candidate_stage ? (
            <p className="mt-4 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-800">
              {candidate.candidate_stage}
            </p>
          ) : null}
          <dl className="mt-6 grid gap-4 text-sm">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-widest text-stone-500">Ideology</dt>
              <dd className="mt-1 text-stone-800">
                Economic {axis(candidate.ideology_x)} · Social {axis(candidate.ideology_y)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-widest text-stone-500">District votes</dt>
              <dd className="mt-1 text-stone-800">{candidate.district_votes ?? 0}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-widest text-stone-500">Filing escrow</dt>
              <dd className="mt-1 text-stone-800">
                {money(pledged)} pledged of {money(target)}
              </dd>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-amber-600" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </dl>
        </article>
      </div>
    </main>
  );
}
