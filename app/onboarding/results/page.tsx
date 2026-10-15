import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import {
  confidencePercent,
  factionTitle,
  MATCH_CONFIDENCE_START,
} from "@/lib/onboarding/diagnostic";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your vector · WHERE 2 RUN",
  description: "The result card for your ideological vector and match confidence.",
};

export default async function OnboardingResultsPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/login?next=%2Fonboarding%2Fresults");

  const coordinate = await loadCoordinate(user.id);
  if (!coordinate) redirect("/onboarding");

  const faction = factionTitle(coordinate);
  const percent = confidencePercent(coordinate.confidence);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 pb-16">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">Step 2</p>
        <article className="mt-6 rounded-3xl border border-amber-500/40 bg-white px-6 py-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Your faction</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-stone-900">{faction}</h1>
          <p className="mt-4 font-mono text-sm tabular-nums text-stone-700">
            Economic {formatAxis(coordinate.x)} · Governance {formatAxis(coordinate.y)}
          </p>
          <div className="mt-8">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800">Match confidence</p>
              <p className="text-sm font-semibold tabular-nums text-stone-900">{percent}%</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200" role="meter" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Match confidence">
              <div className="h-full rounded-full bg-amber-600" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              {percent}% match confidence. The Townhall raises this as you answer wedge questions in your matched races.
            </p>
          </div>
        </article>
        <Link
          href="/onboarding/location"
          className="mt-8 inline-flex h-11 w-fit items-center justify-center rounded-md bg-gold-strong px-5 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
        >
          Add your voting ZIP
        </Link>
      </div>
    </main>
  );
}

function formatAxis(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? `+${rounded.toFixed(2)}` : rounded.toFixed(2);
}

async function loadCoordinate(userId: string) {
  const admin = createAdminClient();
  let result = await admin
    .from("profiles")
    .select("ideology_x, ideology_y, confidence_score")
    .eq("id", userId)
    .maybeSingle();
  if (result.error && isMissingSchema(result.error)) {
    result = await admin.from("profiles").select("ideology_x, ideology_y").eq("id", userId).maybeSingle();
  }
  if (result.error || !result.data) return null;
  const row = result.data as { ideology_x: number | null; ideology_y: number | null; confidence_score?: number | null };
  if (row.ideology_x == null || row.ideology_y == null) return null;
  const confidence =
    typeof row.confidence_score === "number" && Number.isFinite(row.confidence_score)
      ? row.confidence_score
      : MATCH_CONFIDENCE_START;
  return { x: row.ideology_x, y: row.ideology_y, confidence };
}
