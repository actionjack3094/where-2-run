"use client";

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
import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";
import type { District } from "@/types/database.types";

export function CreateDebateButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="gold" onClick={() => setOpen(true)}>
        Create Debate
      </Button>
      {open ? (
        <CreateDebateModal onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function CreateDebateModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [name, setName] = useState("");
  const [district, setDistrict] = useState<District | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setName(window.sessionStorage.getItem(STORAGE_KEYS.username) ?? "");

    async function loadDistrict() {
      const { data } = await supabase.from("districts").select("*").order("name");
      const districts = (data ?? []) as District[];
      const storedId = window.sessionStorage.getItem(STORAGE_KEYS.districtId);
      const selected =
        districts.find((entry) => entry.id === storedId) ?? districts[0] ?? null;
      if (selected) {
        window.sessionStorage.setItem(STORAGE_KEYS.districtId, selected.id);
      }
      setDistrict(selected);
    }

    void loadDistrict();
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
      router.push(`/arena/${payload.id}`);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not post the debate.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-14 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
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
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
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
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Topic
              </span>
              <textarea
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                rows={4}
                required
                placeholder="Should this district freeze property taxes on primary residences?"
                className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Your name on the ballot
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Candidate A"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </label>
            {formError ? <p className="text-sm text-muted-foreground">{formError}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" variant="gold" className="flex-1" disabled={submitting}>
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
