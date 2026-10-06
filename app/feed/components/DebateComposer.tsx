"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { StanceModal } from "@/components/debate/StanceModal";

export function DebateComposer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="sticky top-14 z-20 mt-8 flex w-full items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-white px-4 py-3 text-left transition-colors hover:border-amber-600"
      >
        <span className="text-sm text-stone-600">Take a stance...</span>
        <MoreHorizontal className="size-4 shrink-0 text-stone-600" aria-hidden />
      </button>
      <StanceModal open={open} onOpenChange={setOpen} />
    </>
  );
}
