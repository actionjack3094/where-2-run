"use client";

import { useEffect, useState } from "react";

function formatRemaining(expiresAt: string) {
  const remainingMs = new Date(expiresAt).getTime() - new Date().getTime();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "EXPIRED";

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [label, setLabel] = useState(() => formatRemaining(expiresAt));

  useEffect(() => {
    const tick = () => setLabel(formatRemaining(expiresAt));
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [expiresAt]);

  return <span suppressHydrationWarning>{label}</span>;
}
