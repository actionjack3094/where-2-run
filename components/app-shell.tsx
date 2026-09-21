"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { STORAGE_KEYS } from "@/lib/session";

export type AppMode = "voter" | "candidate";

type AppModeContextValue = {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
};

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error("useAppMode must be used within AppShell.");
  }
  return context;
}

function isAppMode(value: string | null): value is AppMode {
  return value === "voter" || value === "candidate";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("voter");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEYS.appMode);
    if (isAppMode(stored)) setModeState(stored);
  }, []);

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    window.localStorage.setItem(STORAGE_KEYS.appMode, next);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <AppModeContext.Provider value={value}>
      <div data-app-mode={mode} className="flex min-h-full flex-1 flex-col border-t-[3px] border-accent">
        {children}
      </div>
    </AppModeContext.Provider>
  );
}

export function ModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useAppMode();

  return (
    <div
      role="group"
      aria-label="Application mode"
      className={cn(
        "inline-flex shrink-0 rounded-full border border-gold/70 bg-zinc-950 p-0.5",
        className,
      )}
    >
      <ModeOption
        label="Voter Mode"
        selected={mode === "voter"}
        onSelect={() => setMode("voter")}
      />
      <ModeOption
        label="Candidate Mode"
        selected={mode === "candidate"}
        onSelect={() => setMode("candidate")}
      />
    </div>
  );
}

function ModeOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest transition-colors",
        selected
          ? "bg-accent text-accent-foreground"
          : "text-zinc-400 hover:text-parchment",
      )}
    >
      {label}
    </button>
  );
}
