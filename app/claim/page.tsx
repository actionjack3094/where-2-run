import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClaimForm, type ClaimTarget } from "@/app/claim/claim-form";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { normalizeEscrowStatus, officialDonationHref } from "@/lib/escrow/candidacy";

export const metadata: Metadata = {
  title: "Claim escrow · WHERE 2 RUN",
  description:
    "File an FEC ID or state registration link so pledged escrow can move into verification.",
};

type ClaimPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

async function loadClaimTargets(userId: string): Promise<{ targets: ClaimTarget[]; error: string | null }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("campaign_targets")
      .select(
        "id, pledged_escrow, election_id, escrow_status, committee_name, official_candidate_id, donation_url",
      )
      .eq("user_id", userId)
      .eq("is_locked", true);

    if (error) {
      return {
        targets: [],
        error: isMissingSchema(error)
          ? "Apply the tier 3 escrow migration before a candidacy filing can be submitted."
          : error.message,
      };
    }

    const rows = (data ?? []) as {
      id: string;
      pledged_escrow: number | string | null;
      election_id: string;
      escrow_status: string | null;
      committee_name: string | null;
      official_candidate_id: string | null;
      donation_url: string | null;
    }[];

    if (rows.length === 0) return { targets: [], error: null };

    const { data: elections } = await admin
      .from("elections")
      .select("id, office_name")
      .in(
        "id",
        rows.map((row) => row.election_id),
      );
    const names = new Map(
      ((elections ?? []) as { id: string; office_name: string | null }[]).map((row) => [
        row.id,
        row.office_name?.trim() || "Open race",
      ]),
    );

    return {
      targets: rows.map((row) => ({
        id: row.id,
        label: names.get(row.election_id) ?? "Open race",
        pledgedEscrow: Number(row.pledged_escrow ?? 0) || 0,
        escrowStatus: normalizeEscrowStatus(row.escrow_status),
        committeeName: row.committee_name,
        officialCandidateId: row.official_candidate_id,
        donationUrl: officialDonationHref(row.donation_url),
      })),
      error: null,
    };
  } catch (caught) {
    return {
      targets: [],
      error: caught instanceof Error ? caught.message : "Could not open locked campaigns.",
    };
  }
}

export default async function ClaimPage({ searchParams }: ClaimPageProps) {
  const user = await getServerUser();
  const query = await searchParams;
  const requestedTarget = firstString(query.target)?.trim() ?? "";
  if (!user) {
    const next = isUuid(requestedTarget) ? `/claim?target=${requestedTarget}` : "/claim";
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const { targets, error } = await loadClaimTargets(user.id);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Tier 3
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Claim escrow
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            File your FEC candidate ID or the state registration link for a locked
            campaign. Escrow stays in review until a platform admin confirms the
            filing and captures the held pledges.
          </p>
        </header>

        {error ? <p className="mt-8 text-sm leading-6 text-zinc-400">{error}</p> : null}

        {!error && targets.length === 0 ? (
          <div className="mt-8">
            <p className="text-sm leading-6 text-zinc-400">
              Claim escrow after you lock a campaign target.
            </p>
            <Link
              href="/my-campaign"
              className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Back to the war room
            </Link>
          </div>
        ) : null}

        {!error && targets.length > 0 ? (
          <ClaimForm
            targets={targets}
            initialTargetId={isUuid(requestedTarget) ? requestedTarget : null}
          />
        ) : null}
      </div>
    </main>
  );
}
