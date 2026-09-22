"use client";

import { useEffect, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/db/supabase";
import { parseVector } from "@/lib/ideology/vector";

const GOLD = "var(--gold)";
const GOLD_MUTED = "color-mix(in oklch, var(--gold) 28%, transparent)";
const RADIUS_DOMAIN: [number, number] = [-1.0, 1.0];

export const IDEOLOGY_RADAR_AXES = [
  "Fiscal & Market",
  "Constitutional & State Scope",
  "Civil Liberties",
  "Labor & Trade",
  "Community Structure",
  "Local Growth",
] as const;

const TEN_DIM_INDEX = [1, 3, 2, 0, 8, 7] as const;

type RadarPoint = {
  axis: (typeof IDEOLOGY_RADAR_AXES)[number];
  value: number;
};

type TickAnchor = "inherit" | "start" | "end" | "middle";

function clampSigned(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

export function mapIdeologyRadarData(vector: unknown): RadarPoint[] {
  const raw = parseVector(vector);
  const values =
    raw.length >= 10
      ? TEN_DIM_INDEX.map((index) => clampSigned(raw[index] ?? 0))
      : IDEOLOGY_RADAR_AXES.map((_, index) => clampSigned(raw[index] ?? 0));

  return IDEOLOGY_RADAR_AXES.map((axis, index) => ({
    axis,
    value: values[index] ?? 0,
  }));
}

function wrapAxisLabel(label: string) {
  const split = label.indexOf("&");
  if (split === -1) return [label];
  return [label.slice(0, split + 1).trim(), label.slice(split + 1).trim()];
}

function AxisTick({
  x = 0,
  y = 0,
  textAnchor = "middle",
  payload,
}: {
  x?: number;
  y?: number;
  textAnchor?: TickAnchor;
  payload?: { value?: string };
}) {
  const lines = wrapAxisLabel(String(payload?.value ?? ""));
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      fill="rgb(161 161 170)"
      fontSize={10}
      fontFamily="var(--font-geist-sans), system-ui, sans-serif"
    >
      {lines.map((line, index) => (
        <tspan key={line} x={x} dy={index === 0 ? 0 : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function IdeologyRadar({
  candidateId,
  vector: initialVector = null,
}: {
  candidateId: string;
  vector?: unknown;
}) {
  const [vector, setVector] = useState<unknown>(initialVector);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("candidates")
        .select("ideology_vector")
        .eq("id", candidateId)
        .maybeSingle();

      if (cancelled || error) return;
      const nextVector = (data as { ideology_vector?: unknown } | null)
        ?.ideology_vector;
      if (nextVector == null) return;
      setVector(nextVector);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  const points = mapIdeologyRadarData(vector);
  const hasCoordinates = parseVector(vector).length > 0;

  return (
    <section aria-labelledby="ideology-radar-heading">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Civic coordinates
        </p>
        <h2
          id="ideology-radar-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Ideological radar
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Six-axis civic position on a fixed scale from -1.0 to 1.0.
        </p>
      </header>

      {hasCoordinates ? (
        <div className="mx-auto mt-8 h-[22rem] w-full max-w-lg">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart
              data={points}
              cx="50%"
              cy="50%"
              outerRadius="72%"
              margin={{ top: 28, right: 40, bottom: 28, left: 40 }}
            >
              <PolarGrid stroke={GOLD_MUTED} gridType="polygon" />
              <PolarAngleAxis
                dataKey="axis"
                tick={<AxisTick />}
                tickLine={false}
                stroke={GOLD_MUTED}
              />
              <PolarRadiusAxis
                type="number"
                domain={RADIUS_DOMAIN}
                allowDataOverflow
                niceTicks="none"
                tickCount={5}
                axisLine={false}
                tick={false}
                tickLine={false}
                stroke={GOLD_MUTED}
              />
              <Radar
                name="Ideology"
                dataKey="value"
                stroke={GOLD}
                fill={GOLD}
                fillOpacity={0.28}
                strokeWidth={2}
                dot={{ r: 3, fill: GOLD, stroke: GOLD }}
                isAnimationActive={false}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-8 text-sm leading-6 text-zinc-400">
          No ideology coordinates on file for this campaign yet.
        </p>
      )}
    </section>
  );
}
