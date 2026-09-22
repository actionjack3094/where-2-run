"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { publishStance } from "@/app/actions/feed/publish-stance";
import { Button } from "@/components/ui/button";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import type { CalibrationPrompt } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

type ComposerMode = "calibration" | "custom";

function RichTextArea({
  labelledBy,
  disabled,
  onChange,
}: {
  labelledBy: string;
  disabled?: boolean;
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
            Argue the mechanism: who pays, which ordinance, which jurisdiction.
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

export function StanceModal({
  open,
  onOpenChange,
  prompt,
  initialMode = "calibration",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: CalibrationPrompt;
  initialMode?: ComposerMode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ComposerMode>(initialMode);
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [claim, setClaim] = useState("");
  const [html, setHtml] = useState("");
  const [plain, setPlain] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  useEffect(() => {
    if (!open) return;
    const active = promptRef.current;
    setMode(initialMode);
    setChoiceId(null);
    setError(null);
    setNotice(null);
    setClaim(initialMode === "custom" ? active.prompt : "");
    setHtml("");
    setPlain("");
    setEditorKey((value) => value + 1);
  }, [open, initialMode, prompt.id, prompt.prompt]);

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

  async function submitCalibration(event: React.FormEvent) {
    event.preventDefault();
    const option = prompt.options.find((entry) => entry.id === choiceId);
    if (!option) {
      setError("Pick a position on this issue.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const token = await accessToken();
      const result = await publishStance(
        {
          mode: "calibration",
          promptId: prompt.id,
          promptText: prompt.prompt,
          claim: prompt.prompt,
          choiceId: option.id,
          choiceLabel: option.label,
          choiceScore: option.score,
          axisId: prompt.axisId,
        },
        token,
      );
      setChoiceId(null);
      setNotice(
        result.electionName
          ? `Locked in. Vector updated against ${result.electionName}.`
          : "Locked in. Your ideology vector was recalibrated.",
      );
      router.push("/feed", { scroll: false });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not file this calibration.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCustom(event: React.FormEvent) {
    event.preventDefault();
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
          promptId: prompt.id,
          promptText: prompt.prompt,
          axisId: prompt.axisId,
          claim: claim.trim() || (initialMode === "custom" ? prompt.prompt : undefined),
          body: html,
        },
        token,
      );
      setClaim("");
      setHtml("");
      setPlain("");
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
                Stance composer
              </p>
              <h2
                id="stance-composer-title"
                className="mt-1 font-display text-base font-semibold tracking-tight text-parchment"
              >
                File a position
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

          <div className="mt-4 grid grid-cols-2 rounded-md border border-zinc-700 p-0.5">
            {(
              [
                ["calibration", "Quick Calibration"],
                ["custom", "Custom Stance"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setError(null);
                }}
                className={cn(
                  "h-8 rounded px-3 text-[10px] font-medium uppercase tracking-widest transition-colors",
                  mode === value
                    ? "bg-gold text-zinc-950"
                    : "text-zinc-400 hover:text-parchment",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "calibration" ? (
            <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void submitCalibration(event)}>
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                {prompt.issueLabel}
              </p>
              <p className="text-sm leading-6 text-zinc-200">{prompt.prompt}</p>
              <fieldset className="grid gap-2">
                <legend className="sr-only">Calibration options</legend>
                {prompt.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={choiceId === option.id}
                    onClick={() => setChoiceId(option.id)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm leading-6 transition-colors",
                      choiceId === option.id
                        ? "border-gold bg-gold/10 text-parchment"
                        : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </fieldset>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              {notice ? <p className="text-sm text-accent-ring">{notice}</p> : null}
              <Button type="submit" variant="gold" className="w-fit" disabled={submitting}>
                {submitting ? "Locking in…" : "Lock in stance"}
              </Button>
            </form>
          ) : (
            <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void submitCustom(event)}>
              {initialMode === "custom" ? (
                <>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                    {prompt.issueLabel}
                  </p>
                  <p className="text-sm leading-6 text-zinc-200">{prompt.prompt}</p>
                </>
              ) : null}
              <p className="text-sm leading-6 text-zinc-400">
                Write the argument. Zoning, CapMetro, and parking map to City Council; capital
                gains and federal tax map to a congressional race.
              </p>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                  Claim (optional)
                </span>
                <input
                  value={claim}
                  onChange={(event) => setClaim(event.target.value)}
                  placeholder="Austin should eliminate minimum parking mandates"
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span
                  id="custom-stance-label"
                  className="text-[10px] font-medium uppercase tracking-widest text-zinc-500"
                >
                  Policy argument
                </span>
                <RichTextArea
                  key={editorKey}
                  labelledBy="custom-stance-label"
                  disabled={submitting}
                  onChange={(nextHtml, nextPlain) => {
                    setHtml(nextHtml);
                    setPlain(nextPlain);
                  }}
                />
              </div>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              {notice ? <p className="text-sm text-accent-ring">{notice}</p> : null}
              <Button type="submit" variant="gold" className="w-fit" disabled={submitting}>
                {submitting ? "Mapping to a race…" : "Publish stance"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
