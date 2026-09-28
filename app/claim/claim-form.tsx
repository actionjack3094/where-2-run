"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitCandidacyProof } from "@/app/actions/escrow/submit-candidacy-proof";
import { supabase } from "@/lib/db/supabase";
import {
  CANDIDACY_PDF_MAX_BYTES,
  CANDIDACY_PROOF_BUCKET,
  type EscrowStatus,
  committeeNameError,
  donationUrlError,
  officialCandidateIdError,
  officialDonationHref,
  pdfHeaderError,
} from "@/lib/escrow/candidacy";

export type ClaimTarget = {
  id: string;
  label: string;
  pledgedEscrow: number;
  escrowStatus: EscrowStatus;
  committeeName: string | null;
  officialCandidateId: string | null;
  donationUrl: string | null;
};

const FIELD_CLASS =
  "mt-2 h-10 w-full rounded-md border border-brass/40 bg-zinc-950 px-3 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-brass/50";

function StatementUpload({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
      Statement of Candidacy (PDF)
      <input
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        className="mt-2 block w-full text-sm normal-case tracking-normal text-zinc-300 file:mr-4 file:rounded-md file:border-0 file:bg-brass file:px-3 file:py-2 file:text-xs file:font-medium file:uppercase file:tracking-widest file:text-charcoal"
      />
      <span className="mt-2 block text-sm normal-case tracking-normal text-zinc-400">
        {file
          ? file.name
          : "FEC Form 2, or the state equivalent filed with the election board."}
      </span>
    </label>
  );
}

async function assertPdf(file: File) {
  if (file.size <= 0 || file.size > CANDIDACY_PDF_MAX_BYTES) {
    throw new Error("Attach a PDF smaller than 10 MB.");
  }
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const error = pdfHeaderError(header);
  if (error) throw new Error(error);
}

export function ClaimForm({
  targets,
  initialTargetId,
}: {
  targets: ClaimTarget[];
  initialTargetId: string | null;
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(
    targets.find((target) => target.id === initialTargetId)?.id ?? targets[0]?.id ?? "",
  );
  const [committeeName, setCommitteeName] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [donationUrl, setDonationUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = targets.find((target) => target.id === targetId) ?? targets[0];
  if (!selected) return null;

  const donationHref = officialDonationHref(selected.donationUrl);

  async function onSubmit() {
    const committeeError = committeeNameError(committeeName);
    const candidateError = officialCandidateIdError(candidateId);
    const donateError = donationUrlError(donationUrl);
    if (committeeError || candidateError || donateError) {
      setError(committeeError ?? candidateError ?? donateError);
      return;
    }
    if (!file) {
      setError("Attach a PDF of the filed Statement of Candidacy.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await assertPdf(file);
      const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
      if (sessionError) throw new Error(sessionError.message);
      const userId = sessionData.user?.id;
      if (!userId) throw new Error("Sign in to claim escrow.");

      const path = `${userId}/${selected.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(CANDIDACY_PROOF_BUCKET)
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const { data: stored } = supabase.storage.from(CANDIDACY_PROOF_BUCKET).getPublicUrl(path);
      await submitCandidacyProof(selected.id, candidateId, stored.publicUrl || path, {
        committeeName,
        donationUrl,
      });
      setFile(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not file that candidacy proof.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-brass/40 bg-zinc-900 px-5 py-5">
      {targets.length > 1 ? (
        <label className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Locked race
          <select
            value={selected.id}
            onChange={(event) => setTargetId(event.target.value)}
            className={FIELD_CLASS}
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm leading-6 text-zinc-300">{selected.label}</p>
      )}
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        Escrow on this race is ${selected.pledgedEscrow.toFixed(2)}.
      </p>

      {selected.escrowStatus === "verification_pending" ? (
        <p className="mt-4 inline-flex rounded-full border border-yellow-400/40 bg-yellow-400/15 px-3 py-1 text-xs font-medium uppercase tracking-widest text-yellow-200">
          FEC/State Verification Pending
        </p>
      ) : null}

      {selected.escrowStatus === "verification_pending" && selected.committeeName ? (
        <p className="mt-4 text-sm leading-6 text-zinc-300">
          {selected.committeeName}
          {selected.officialCandidateId ? ` · ${selected.officialCandidateId}` : ""} is in review.
        </p>
      ) : null}

      {selected.escrowStatus === "released" ? (
        <div className="mt-4">
          <p className="text-sm leading-6 text-zinc-300">
            This escrow has been released to the committee.
          </p>
          {donationHref ? (
            <a
              href={donationHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-brass px-4 text-xs font-medium uppercase tracking-widest text-charcoal hover:bg-brass-dark"
            >
              Donate
            </a>
          ) : null}
        </div>
      ) : null}

      {selected.escrowStatus === "accumulating" ? (
        <form
          className="mt-5 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <label className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            Official campaign committee name
            <input
              value={committeeName}
              onChange={(event) => setCommitteeName(event.target.value)}
              autoComplete="organization"
              required
              className={FIELD_CLASS}
            />
          </label>
          <label className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            Government candidate ID
            <input
              value={candidateId}
              onChange={(event) => setCandidateId(event.target.value)}
              placeholder="FEC ID or state election board ID"
              autoComplete="off"
              required
              className={FIELD_CLASS}
            />
          </label>
          <label className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            ActBlue or WinRed page
            <input
              type="url"
              value={donationUrl}
              onChange={(event) => setDonationUrl(event.target.value)}
              placeholder="https://secure.actblue.com/donate/…"
              required
              className={FIELD_CLASS}
            />
          </label>
          <StatementUpload file={file} onFile={setFile} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-brass px-4 text-xs font-medium uppercase tracking-widest text-charcoal transition-colors hover:bg-brass-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Filing proof…" : "Submit candidacy proof"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      <Link
        href="/my-campaign"
        className="mt-6 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
      >
        Back to the war room
      </Link>
    </section>
  );
}
