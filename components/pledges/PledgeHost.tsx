"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PledgeModal, type PledgeTarget } from "@/components/pledges/PledgeModal";

type PledgeContextValue = {
  openPledge: (target: PledgeTarget) => void;
};

const PledgeContext = createContext<PledgeContextValue | null>(null);

export function usePledge() {
  const context = useContext(PledgeContext);
  if (!context) {
    throw new Error("usePledge must be used within PledgeHost.");
  }
  return context;
}

export function PledgeHost({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<PledgeTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const openPledge = useCallback((next: PledgeTarget) => {
    setTarget(next);
  }, []);

  const value = useMemo(() => ({ openPledge }), [openPledge]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <PledgeContext.Provider value={value}>
      {children}
      {target && (
        <PledgeModal
          target={target}
          onClose={() => setTarget(null)}
          onConfirmed={setToast}
        />
      )}
      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6"
        >
          <p className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
            {toast}
          </p>
        </div>
      )}
    </PledgeContext.Provider>
  );
}
