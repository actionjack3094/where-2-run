export const LENA_ESCROW_KEY = "lena_tx10_escrow";
export const LENA_ESCROW_BASE = 1850;
export const LENA_ESCROW_TARGET = 3125;
export const LENA_CANDIDATE_ID = "c1111111-1111-1111-1111-111111111111";

export function readLenaEscrow() {
  if (typeof window === "undefined") return LENA_ESCROW_BASE;
  try {
    const value = Number(window.localStorage.getItem(LENA_ESCROW_KEY));
    if (!Number.isFinite(value) || value < LENA_ESCROW_BASE) return LENA_ESCROW_BASE;
    return value;
  } catch {
    return LENA_ESCROW_BASE;
  }
}

export function writeLenaEscrow(total: number) {
  const next = Math.max(LENA_ESCROW_BASE, Math.round(total));
  window.localStorage.setItem(LENA_ESCROW_KEY, String(next));
  window.dispatchEvent(new Event("lena-escrow"));
}

export function subscribeLenaEscrow(onStoreChange: () => void) {
  window.addEventListener("lena-escrow", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("lena-escrow", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}
