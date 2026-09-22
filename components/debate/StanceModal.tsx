"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { publishStance } from "@/app/actions/feed/publish-stance";
import { Button } from "@/components/ui/button";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { toNumber } from "@/lib/electability";

const AUTO_ASSIGN = "";
const TOPIC_PLACEHOLDER =
  "e.g., Austin should eliminate all single-family zoning within 1 mile of transit corridors.";
const ARGUMENT_PLACEHOLDER =
  "Make your opening case. This argument will establish your stance and initialize the debate record...";

type TargetRace = {
  id: string;
  officeName: string;
};

function RichTextArea({
  labelledBy,
  disabled,
  placeholder,
  onChange,
}: {
  labelledBy: string;
  disabled?: boolean;
  placeholder: string;
  onChange: (html: string, text: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);

  function emit() {
    const node = editorRef.current;
    if (!node) return;
    const html = node.innerHTML;
    const text = node.innerText.replace(/\u00a0/g, " ").trim();
    setEmpty(text.length === 0);
    onChange(html, text);
  }

  function format(command: "bold" | "italic" | "insertUnorderedList") {
    editorRef.current?.focus();
    document.execCommand(command, false);
    emit();
  }

  return (
    <div className="overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 focus-within:border-zinc-400">
      <div className="flex gap-1 border-b border-zinc-800 px-2 py-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => format("bold")}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
          aria-label="Bold"
        >
          B
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => format("italic")}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-xs font-serif text-zinc-300 hover:bg-zinc-800"
          aria-label="Italic"
        >
          I
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => format("insertUnorderedList")}
          className="inline-flex h-7 items-center justify-center rounded px-2 text-[10px] font-medium uppercase tracking-widest text-zinc-400 hover:bg-zinc-800"
          aria-label="Bulleted list"
        >
          List
        </button>
      </div>
      <div className="relative">
        {empty ? (
          <p className="pointer-events-none absolute inset-x-3 top-2 text-sm leading-6 text-zinc-500">
            {placeholder}
          </p>
        ) : null}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelledBy}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          className="min-h-32 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none"
        />
      </div>
    </div>
  );
}

async function loadTargetRaces(): Promise<TargetRace[]> {
  const arenaUser = await ensureArenaUser();
  const { data: scores, error: scoreError } = await supabase
    .from("electability_scores")
    .select("district_id, ideological_match_pct, electability_multiplier")
    .eq("user_id", arenaUser.id);

  if (scoreError || !scores?.length) return [];

  const ranked = [...scores].sort((left, right) => {
    const electability =
      toNumber(right.electability_multiplier) - toNumber(left.electability_multiplier);
    if (electability !== 0) return electability;
    return toNumber(right.ideological_match_pct) - toNumber(left.ideological_match_pct);
  });

  const rank = new Map<string, number>();
  ranked.forEach((row, index) => {
    if (!rank.has(row.district_id)) rank.set(row.district_id, index);
  });

  const { data: elections, error: electionError } = await supabase
    .from("elections")
    .select("id, office_name, district_id")
    .in("district_id", [...rank.keys()]);

  if (electionError || !elections?.length) return [];

  return elections
    .filter((row) => row.district_id && rank.has(row.district_id))
    .sort(
      (left, right) =>
        (rank.get(left.district_id ?? "") ?? 99) - (rank.get(right.district_id ?? "") ?? 99),
    )
    .slice(0, 8)
    .map((row) => ({ id: row.id, officeName: row.office_name }));
}

export function StanceModal({
  open,
  onOpenChange,
  initialTopic = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTopic?: string;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [html, setHtml] = useState("");
  const [plain, setPlain] = useState("");
  const [electionId, setElectionId] = useState(AUTO_ASSIGN);
  const [races, setRaces] = useState<TargetRace[]>([]);
  const [editorKey, setEditorKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotice(null);
    setTopic(initialTopic);
    setHtml("");
    setPlain("");
    setElectionId(AUTO_ASSIGN);
    setEditorKey((value) => value + 1);
  }, [open, initialTopic]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void loadTargetRaces()
      .then((rows) => {
        if (!cancelled) setRaces(rows);
      })
      .catch(() => {
        if (!cancelled) setRaces([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onOpenChange(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange, submitting]);

  function closeModal() {
    if (submitting) return;
    onOpenChange(false);
  }

  async function accessToken() {
    await ensureArenaUser();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!topic.trim()) {
      setError("Name the proposition before publishing.");
      return;
    }
    if (plain.trim().length < 48) {
      setError("Give a fuller policy argument so we can map it to a race.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const token = await accessToken();
      const result = await publishStance(
        {
          mode: "custom",
          claim: topic.trim(),
          body: html,
          electionId: electionId || null,
        },
        token,
      );
      setTopic("");
      setHtml("");
      setPlain("");
      setElectionId(AUTO_ASSIGN);
      setEditorKey((value) => value + 1);
      const mapped = result.electionName
        ? `Assigned to ${result.electionName}`
        : "Filed as an unassigned floor debate";
      const keys = result.keywords.length ? ` via ${result.keywords.slice(0, 4).join(", ")}` : "";
      setNotice(`${mapped}${keys}.`);
      router.push("/feed", { scroll: false });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish this stance.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={closeModal}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stance-composer-title"
        className="relative max-h-[min(90vh,44rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rounded-xl border border-gold/40 bg-zinc-900 p-4 shadow-[inset_3px_0_0_0_var(--gold)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gold">
                Debate composer
              </p>
              <h2
                id="stance-composer-title"
                className="mt-1 font-display text-base font-semibold tracking-tight text-parchment"
              >
                Start a debate
              </h2>
            </div>
            <button
              type="button"
              onClick={closeModal}
              disabled={submitting}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                Topic / Proposition
              </span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={TOPIC_PLACEHOLDER}
                disabled={submitting}
                className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400 disabled:opacity-50"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span
                id="custom-stance-label"
                className="text-[10px] font-medium uppercase tracking-widest text-zinc-500"
              >
                Argument / Stance
              </span>
              <RichTextArea
                key={editorKey}
                labelledBy="custom-stance-label"
                disabled={submitting}
                placeholder={ARGUMENT_PLACEHOLDER}
                onChange={(nextHtml, nextPlain) => {
                  setHtml(nextHtml);
                  setPlain(nextPlain);
                }}
              />
            </div>

            <label className="flex flex-col gap-1.5 text-sm">
              <span
                id="target-race-label"
                className="text-[10px] font-medium uppercase tracking-widest text-zinc-500"
              >
                Target Race
              </span>
              <select
                aria-labelledby="target-race-label"
                value={electionId}
                disabled={submitting}
                onChange={(event) => setElectionId(event.target.value)}
                className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-zinc-400 disabled:opacity-50"
              >
                <option value={AUTO_ASSIGN}>
                  Auto-Assign (AI Evaluates Jurisdictional Scope)
                </option>
                {races.map((race) => (
                  <option key={race.id} value={race.id}>
                    {race.officeName}
                  </option>
                ))}
              </select>
            </label>

            <p className="inline-flex w-fit items-center rounded-full border border-gold/30 bg-zinc-950 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-gold/80">
              Publishing calibrates your 6-axis ideology
            </p>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            {notice ? <p className="text-sm text-accent-ring">{notice}</p> : null}

            <Button type="submit" variant="gold" className="w-fit" disabled={submitting}>
              {submitting ? "Publishing…" : "Publish Debate & Record Stance"}
            </Button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
