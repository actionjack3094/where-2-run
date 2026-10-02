import type { Metadata } from "next";
import Link from "next/link";
import { ClaimForm } from "@/app/verify/claim-form";
import { IdentityVerifyButton } from "@/app/verify/identity-button";
import { getServerUser } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isMissingSchema } from "@/lib/db/schema-errors";

export const metadata: Metadata = {
  title: "Verify identity · WHERE 2 RUN",
  description:
    "Confirm a government ID with Stripe Identity, then claim a seeded candidate profile.",
};

type SeededProfile = {
  id: string;
  displayName: string;
  office: string | null;
};

type ClaimState = {
  status: string;
  ballotName: string | null;
  governmentIdStatus: string | null;
};

export default async function VerifyPortalPage() {
  const user = await getServerUser().catch(() => null);
  let profiles: SeededProfile[] = [];
  let claim: ClaimState | null = null;
  let loadError: string | null = null;
  let identityVerified = false;

  if (user) {
    try {
      const admin = createAdminClient();
      const [candidateResult, claimResult, accountResult, profileResult] = await Promise.all([
        admin.from("candidates").select("id, display_name, office_sought, claimed_by").limit(100),
        admin
          .from("tier3_verifications")
          .select("claim_status, ballot_name, government_id_status, claimed_candidate_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        admin.from("users").select("tier").eq("id", user.id).maybeSingle(),
        admin.from("profiles").select("tier2_status").eq("id", user.id).maybeSingle(),
      ]);
      identityVerified =
        accountResult.data?.tier === "verified" ||
        profileResult.data?.tier2_status === "verified";

      if (candidateResult.error) {
        loadError = isMissingSchema(candidateResult.error)
          ? "Apply the production expansion migration before claims can be filed."
          : candidateResult.error.message;
      } else {
        const claimedId = claimResult.data?.claimed_candidate_id ?? null;
        profiles = (candidateResult.data ?? [])
          .filter((row) => !row.claimed_by || row.claimed_by === user.id || row.id === claimedId)
          .filter((row) => !row.claimed_by || row.claimed_by === user.id)
          .map((row) => ({
            id: row.id,
            displayName: row.display_name?.trim() || "Seeded candidate",
            office: row.office_sought,
          }));
      }

      if (claimResult.error && !isMissingSchema(claimResult.error)) {
        loadError = claimResult.error.message;
      } else if (claimResult.data) {
        claim = {
          status: claimResult.data.claim_status,
          ballotName: claimResult.data.ballot_name,
          governmentIdStatus: claimResult.data.government_id_status,
        };
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Could not open the claim ledger.";
    }
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Tier 2
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Verify your identity
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Voters and candidates confirm a government ID through Stripe. A verified
            account is marked on your profile after Stripe finishes the check.
          </p>
        </header>

        {user ? <IdentityVerifyButton verified={identityVerified} /> : null}

        {!user ? (
          <Link
            href="/auth/login?next=%2Fverify"
            className="mt-8 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
          >
            Sign in to verify your identity
          </Link>
        ) : null}

        {claim ? (
          <div className="mt-8 rounded-xl border border-gold/50 bg-zinc-900 px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
              Claim {claim.status}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Government ID reference is {claim.governmentIdStatus ?? "unsubmitted"}.
              {claim.ballotName ? ` Ballot name: ${claim.ballotName}.` : ""}
            </p>
          </div>
        ) : null}

        <section className="mt-12 border-t border-zinc-800 pt-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Tier 3
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
            Claim a seeded profile
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Campaign managers can also file a government ID reference and the name printed
            on the local ballot. That reference stays in review until the ballot cross-check
            is confirmed.
          </p>
          {loadError ? <p className="mt-8 text-sm leading-6 text-zinc-400">{loadError}</p> : null}
          {user && !loadError && claim?.status !== "matched" ? (
            <ClaimForm profiles={profiles} />
          ) : null}
        </section>
      </div>
    </main>
  );
}
