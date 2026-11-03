"use client";

import { useRef, useState } from "react";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import type { SoapboxLens } from "@/components/soapbox/types";

const MAX = 500;
const COMPOSER_ID = "soapbox-composer";

const PLACEHOLDER: Record<SoapboxLens, string> = {
  candidate: "Post a campaign dispatch or issue stance to your matched primary network...",
  voter: "What is happening in your district? Start the local conversation...",
};

function grow(node: HTMLTextAreaElement) {
  node.style.height = "auto";
  node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
}

export function SoapboxComposer({
  activeTab,
  name,
  districtLabel,
  onPost,
}: {
  activeTab: SoapboxLens;
  name: string;
  districtLabel: string;
  onPost: (text: string) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const remaining = MAX - text.length;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    onPost(body);
    setText("");
    if (field.current) field.current.style.height = "auto";
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-amber-200/70 bg-white p-4 shadow-sm mb-6"
    >
      <div className="flex gap-3">
        <CandidateAvatar name={name} size="md" />
        <textarea
          ref={field}
          id={COMPOSER_ID}
          value={text}
          rows={2}
          maxLength={MAX}
          placeholder={PLACEHOLDER[activeTab]}
          aria-label="Soapbox post"
          onChange={(event) => {
            setText(event.target.value.slice(0, MAX));
            grow(event.target);
          }}
          className="min-h-16 w-full flex-1 resize-none overflow-y-auto bg-transparent text-sm leading-6 text-stone-900 outline-none placeholder:text-stone-400"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-xs tabular-nums text-stone-500">{remaining} left</p>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-800">
          {activeTab === "candidate" ? "MATCHED PRIMARY NETWORK" : `Posting to ${districtLabel}`}
        </span>
        <button
          type="submit"
          disabled={text.trim().length === 0}
          className="ml-auto rounded-md bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Post to Soapbox
        </button>
      </div>
    </form>
  );
}
