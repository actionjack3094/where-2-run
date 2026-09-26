"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebounce } from "@/lib/hooks/use-debounce";

const INPUT_CLASS =
  "h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-4 text-sm text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60";

function SearchBarField({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const debouncedQuery = useDebounce(query);
  const pathnameRef = useRef(pathname);
  const searchParamsRef = useRef(searchParams);
  const routerRef = useRef(router);
  const writtenQuery = useRef(searchParams.get("q") ?? "");

  pathnameRef.current = pathname;
  searchParamsRef.current = searchParams;
  routerRef.current = router;

  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    if (urlQuery === writtenQuery.current) return;
    writtenQuery.current = urlQuery;
    setQuery(urlQuery);
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    const current = params.get("q") ?? "";
    if (debouncedQuery === current) {
      writtenQuery.current = debouncedQuery;
      return;
    }

    if (debouncedQuery) {
      params.set("q", debouncedQuery);
    } else {
      params.delete("q");
    }
    params.delete("page");

    writtenQuery.current = debouncedQuery;
    const next = params.toString();
    const path = pathnameRef.current;
    routerRef.current.replace(next ? `${path}?${next}` : path, { scroll: false });
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
