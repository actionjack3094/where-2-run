"use client";

import { Suspense, useEffect, useEffectEvent, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebounce } from "@/lib/hooks/use-debounce";

const INPUT_CLASS =
  "h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-4 text-sm text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60";

function SearchBarField({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const debouncedQuery = useDebounce(query);

  // Adopt external URL changes (back/forward, links) during render. Ignore the
  // echo of our own debounced write so it cannot clobber in-progress typing.
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (seenUrlQuery !== urlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== debouncedQuery) setQuery(urlQuery);
  }

  // Effect Event: always reads the latest router/path/params without making the
  // debounce effect re-run (and revert the URL) when they change.
  const writeQuery = useEffectEvent((nextQuery: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if ((params.get("q") ?? "") === nextQuery) return;

    if (nextQuery) {
      params.set("q", nextQuery);
    } else {
      params.delete("q");
    }
    params.delete("page");

    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  });

  useEffect(() => {
    writeQuery(debouncedQuery);
  }, [debouncedQuery]);

  return (
    <input
      type="text"
      value={query}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => setQuery(event.target.value)}
      className={INPUT_CLASS}
    />
  );
}

export function SearchBar({ placeholder = "Search..." }: { placeholder?: string }) {
  return (
    <Suspense
      fallback={
        <input
          type="text"
          placeholder={placeholder}
          aria-label={placeholder}
          readOnly
          className={INPUT_CLASS}
        />
      }
    >
      <SearchBarField placeholder={placeholder} />
    </Suspense>
  );
}
