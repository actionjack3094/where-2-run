"use client";

import { useState } from "react";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { updateProfileAvatar } from "@/lib/actions/profile";
import { createClient } from "@/lib/db/supabase";

const MAX_BYTES = 2 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function AvatarUpload({
  userId,
  name,
  avatarUrl,
}: {
  userId: string;
  name: string;
  avatarUrl: string | null;
}) {
  const [current, setCurrent] = useState(avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
      <div className="flex items-center gap-4">
        <CandidateAvatar name={name} avatarUrl={current} size="lg" />
        <div>
          <p className="text-sm font-medium text-parchment">{name}</p>
          <p className="mt-1 text-sm leading-6 text-zinc-400">JPG, PNG, or WebP. Under 2MB.</p>
        </div>
      </div>
      <label className="mt-5 inline-flex cursor-pointer items-center rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-950">
        {pending ? "Uploading…" : "Choose photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file || pending) return;
            const extension = EXTENSIONS[file.type];
            if (!extension) {
              setMessage(null);
              setError("Use a JPG, PNG, or WebP image.");
              return;
            }
            if (file.size > MAX_BYTES) {
              setMessage(null);
              setError("Images must be under 2MB.");
              return;
            }
            setPending(true);
            setError(null);
            setMessage(null);
            const path = `${userId}/${Date.now()}-avatar.${extension}`;
            const supabase = createClient();
            void supabase.storage
              .from("avatars")
              .upload(path, file, { contentType: file.type, upsert: false })
              .then(async (uploaded) => {
                if (uploaded.error) {
                  setError(uploaded.error.message);
                  setPending(false);
                  return;
                }
                const { data } = supabase.storage.from("avatars").getPublicUrl(path);
                const saved = await updateProfileAvatar(data.publicUrl);
                setPending(false);
                if (saved.error) {
                  setError(saved.error);
                  return;
                }
                setCurrent(saved.avatarUrl ?? data.publicUrl);
                setMessage(saved.message ?? "Photo saved.");
              });
          }}
        />
      </label>
      {message ? <p className="mt-3 text-sm text-parchment">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-zinc-300">{error}</p> : null}
    </form>
  );
}
