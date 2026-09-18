"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ensureArenaUser } from "@/lib/arena/identity";
import { getExpiryState, TOTAL_ROUNDS } from "@/lib/arena/time";
import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";
import { cn } from "@/lib/utils";
import type {
  DebateCandidate,
  DebateStatus,
  DebateWithCandidates,
  District,
} from "@/types/database.types";

const ACTIVE_STATUSES: DebateStatus[] = ["matching", "active", "voting"];

function unwrapCandidate(
  value: DebateWithCandidates["candidate_a"],
): DebateCandidate | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function statusLabel(status: string, expired: boolean) {
  if (expired || status === "expired") return "Expired";
  if (status === "matching") return "Matching";
  if (status === "voting") return "Voting";
  if (status === "completed") return "Completed";
  return "Active";
}

export default function ArenaPage() {
  const router = useRouter();
  const [district, setDistrict] = useState<District | null>(null);
  const [debates, setDebates] = useState<DebateWithCandidates[]>([]);
  const [stage, setStage] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function loadFeed() {
    setError(null);

    const { data: districts, error: districtError } = await supabase
      .from("districts")
      .select("*")
      .order("name");

    if (districtError || !districts?.length) {
      setError(districtError?.message ?? "No districts are available.");
      setStage("error");
      return;
    }

    const storedId = window.sessionStorage.getItem(STORAGE_KEYS.districtId);
    const selected =
      districts.find((entry) => entry.id === storedId) ?? districts[0];
    window.sessionStorage.setItem(STORAGE_KEYS.districtId, selected.id);
    setDistrict(selected);

    const { data, error: debateError } = await supabase
      .from("debates")
      .select(
        `
        *,
        candidate_a:users!debates_candidate_a_id_fkey ( id, username ),
        candidate_b:users!debates_candidate_b_id_fkey ( id, username )
      `,
      )
      .eq("district_id", selected.id)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false });

    if (debateError) {
      setError(debateError.message);
      setStage("error");
      return;
    }

    setDebates((data ?? []) as DebateWithCandidates[]);
    setStage("ready");
  }

  useEffect(() => {
    void loadFeed();
  }, []);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/"
            className="w-fit text-xs font-medium uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50"
          >
            Where 2 Run
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Arena</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {district
              ? `Active debates in ${district.name}.`
              : "Asynchronous debates for your selected district."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="w-fit">
            <Link href="/spectator">Donor Feed</Link>
          </Button>
          <Button type="button" onClick={() => setModalOpen(true)} className="w-fit">
            Create Debate
          </Button>
        </div>
      </div>

      {stage === "loading" && (
        <p className="mt-16 text-sm text-zinc-500">Loading the floor…</p>
      )}

      {stage === "error" && (
        <section className="mt-16 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {error ?? "Something went wrong."}
          </p>
          <Button type="button" onClick={() => void loadFeed()}>
            Try again
          </Button>
        </section>
      )}

      {stage === "ready" && debates.length === 0 && (
        <Card className="mt-12">
          <CardHeader>
            <CardTitle>No live debates</CardTitle>
            <CardDescription>
              Post a topic and wait for a challenger in this district.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {stage === "ready" && debates.length > 0 && (
        <section className="mt-10 flex flex-col gap-3">
          {debates.map((debate) => {
            const candidateA = unwrapCandidate(debate.candidate_a);
            const candidateB = unwrapCandidate(debate.candidate_b);
            const expiry = getExpiryState(debate.expires_at);
            return (
              <Link key={debate.id} href={`/arena/${debate.id}`} className="block">
                <Card className="transition-colors hover:border-zinc-400 dark:hover:border-zinc-500">
                  <CardHeader className="gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{statusLabel(debate.status, expiry.tone === "expired")}</Badge>
                      <Badge>
                        Round {Math.min(debate.current_round, TOTAL_ROUNDS)} of {TOTAL_ROUNDS}
                      </Badge>
                      <Badge
                        className={cn(
                          expiry.tone === "expired" && "border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50",
                          expiry.tone === "soon" && "border-amber-500 text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {expiry.label}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg leading-snug">{debate.topic}</CardTitle>
                    <CardDescription>
                      {candidateA?.username ?? "Open seat"} vs {candidateB?.username ?? "Open seat"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </section>
      )}

      {modalOpen && (
        <CreateDebateModal
          district={district}
          onClose={() => setModalOpen(false)}
          onCreated={(id) => {
            setModalOpen(false);
            router.push(`/arena/${id}`);
          }}
        />
      )}
    </main>
  );
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500 dark:border-zinc-800 dark:text-zinc-400",
        className,
      )}
    >
      {children}
    </span>
  );
}

function CreateDebateModal({
  district,
  onClose,
  onCreated,
}: {
  district: District | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setName(window.sessionStorage.getItem(STORAGE_KEYS.username) ?? "");
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!topic.trim()) {
      setFormError("Give the floor a topic.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const user = await ensureArenaUser(name);
      const response = await fetch("/api/arena/debates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          districtId: district?.id ?? null,
          candidateAId: user.id,
        }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "Could not post the debate.");
      }
      onCreated(payload.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not post the debate.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <Card
        role="dialog"
        aria-labelledby="create-debate-title"
        className="w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            New debate
          </p>
          <CardTitle id="create-debate-title">Create Debate</CardTitle>
          <CardDescription>
            You open as Candidate A. A challenger can take the other lectern.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                Topic
              </span>
              <textarea
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                rows={4}
                required
                placeholder="Should this district freeze property taxes on primary residences?"
                className="resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                Your name on the ballot
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Candidate A"
                className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-50"
              />
            </label>
            {formError && <p className="text-sm text-zinc-600 dark:text-zinc-300">{formError}</p>}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? "Posting…" : "Post topic"}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
