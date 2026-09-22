"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { StanceModal } from "@/components/debate/StanceModal";
import type { CalibrationPrompt } from "@/lib/feed/types";

export function DebateComposer({ prompt }: { prompt: CalibrationPrompt }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="sticky top-14 z-20 mt-8 flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-left transition-colors hover:border-zinc-600"
      >
        <span className="text-sm text-zinc-500">Take a stance...</span>
        <MoreHorizontal className="size-4 shrink-0 text-zinc-400" aria-hidden />
      </button>
      <StanceModal open={open} onOpenChange={setOpen} prompt={prompt} />
    </>
  );
}
