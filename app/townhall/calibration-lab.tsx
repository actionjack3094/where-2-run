"use client";

import { useEffect, useRef, useState } from "react";
import { calibrateWedge } from "@/lib/actions/townhall-calibration";
import { CalibrationCard } from "@/components/townhall/CalibrationCard";
import { VectorMeter } from "@/components/townhall/VectorMeter";
import { type LikertChoice, type WedgeCard } from "@/lib/townhall/calibration";

type Snapshot = {
  x: number;
  y: number;
  confidence: number;
  placed: boolean;
};

type Phase = "in" | "out";

const LEAVE_MS = 280;

function motionMs() {
  if (typeof window === "undefined") return LEAVE_MS;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : LEAVE_MS;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function CalibrationLab({
  initial,
  cards,
  previouslyFiled,
}: {
  initial: Snapshot;
  cards: WedgeCard[];
  previouslyFiled: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<Phase>("in");
  const [busyChoice, setBusyChoice] = useState<LikertChoice | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filed, setFiled] = useState(previouslyFiled);
  const mounted = useRef(true);
  const lock = useRef(false);

  const card = cards[cursor] ?? null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function advance() {
    setPhase("out");
    await wait(motionMs());
    if (!mounted.current) return;
    setCursor((current) => current + 1);
    setPhase("in");
    setBusyChoice(null);
    lock.current = false;
  }

  async function answer(choice: LikertChoice) {
    if (!card || lock.current) return;
    lock.current = true;
    setBusyChoice(choice);
    setError(null);
    try {
      const next = await calibrateWedge({ questionId: card.id, choice });
      if (!mounted.current) return;
      setSnapshot({
        x: next.x,
        y: next.y,
        confidence: next.confidence,
        placed: next.placed,
      });
      if (next.toast) {
        setFiled(true);
        setToast(next.toast);
      }
      await advance();
    } catch (caught) {
      if (!mounted.current) return;
      setPhase("in");
      setBusyChoice(null);
      lock.current = false;
      setError(caught instanceof Error ? caught.message : "Could not file this topic.");
    }
  }

  async function skip() {
    if (!card || lock.current) return;
    lock.current = true;
    setBusyChoice("skip");
    setError(null);
    await advance();
  }

  return (
    <>
      <VectorMeter snapshot={snapshot} />
      <div className="mt-6 overflow-hidden">
        <CalibrationCard
          card={card}
          phase={phase}
          filed={filed}
          busyChoice={busyChoice}
          error={error}
          onAnswer={(choice) => void answer(choice)}
          onSkip={() => void skip()}
        />
      </div>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
          <p
            role="status"
            className="rounded-full border border-amber-500/40 bg-white px-4 py-2 text-sm text-stone-800 shadow-lg"
          >
            {toast}
          </p>
        </div>
      ) : null}
    </>
  );
}
