"use client";

import { useSyncExternalStore } from "react";
import {
  LENA_ESCROW_BASE,
  LENA_ESCROW_TARGET,
  readLenaEscrow,
  subscribeLenaEscrow,
} from "@/lib/lena-escrow";

export function useLenaEscrow() {
  return useSyncExternalStore(subscribeLenaEscrow, readLenaEscrow, () => LENA_ESCROW_BASE);
}

function dollars(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function LenaEscrowPledge({ match }: { match: number }) {
  const pledged = useLenaEscrow();
  return (
    <>
      {match}% Ideological Match · {dollars(pledged)} / {dollars(LENA_ESCROW_TARGET)} Escrow Pledged
    </>
  );
}
