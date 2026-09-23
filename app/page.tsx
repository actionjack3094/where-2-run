import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FileCheck,
  Landmark,
  Lock,
  Radar,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getServerUser } from "@/lib/db/supabase-server";

export const metadata: Metadata = {
  title: "WHERE 2 RUN",
  description:
    "A decentralized civic platform to debate policy, mathematically prove your viability, and unlock campaign escrow bounties before you ever file to run.",
};

const RADAR_LABELS = ["Fiscal", "Scope", "Liberty", "Labor", "Civic", "Growth"] as const;
const RADAR_VALUES = [0.78, 0.42, 0.86, 0.34, 0.58, 0.7] as const;

const DRAFT_ROWS = [
  { office: "City Council · D4", amount: "$12,400", status: "Vaulted" },
  { office: "State House 47", amount: "$48,200", status: "Vaulted" },
  { office: "Compliance packet", amount: "On file", status: "Unlocks" },
] as const;

function radarPoint(index: number, scale: number) {
  const cx = 120;
  const cy = 118;
  const radius = 68;
  const angle = (Math.PI * 2 * index) / RADAR_LABELS.length - Math.PI / 2;
  return {
    x: cx + Math.cos(angle) * radius * scale,
    y: cy + Math.sin(angle) * radius * scale,
  };
}

function polygonPoints(scaleFor: (index: number) => number) {
  return RADAR_LABELS.map((_, index) => {
    const point = radarPoint(index, scaleFor(index));
    return `${point.x},${point.y}`;
  }).join(" ");
}

function IdeologyRadarMock() {
  return (
    <div
      aria-hidden="true"
      className="flex h-64 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-3"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        <Radar className="size-3 text-gold" />
        Ideology radar
      </div>
      <svg viewBox="0 0 240 228" className="mt-1 min-h-0 w-full flex-1">
        {[0.34, 0.67, 1].map((ring) => (
          <polygon
            key={ring}
            points={polygonPoints(() => ring)}
            fill="none"
            stroke="rgb(63 63 70)"
            strokeWidth="1"
          />
        ))}
        {RADAR_LABELS.map((label, index) => {
          const edge = radarPoint(index, 1);
          const labelPoint = radarPoint(index, 1.32);
          return (
            <g key={label}>
              <line
                x1="120"
                y1="118"
                x2={edge.x}
                y2={edge.y}
                stroke="rgb(63 63 70)"
                strokeWidth="1"
              />
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgb(161 161 170)"
                fontSize="9"
                fontFamily="var(--font-geist-sans), system-ui, sans-serif"
              >
                {label}
              </text>
            </g>
          );
        })}
        <polygon
          points={polygonPoints((index) => RADAR_VALUES[index] ?? 0)}
          fill="color-mix(in oklch, var(--gold) 28%, transparent)"
          stroke="var(--gold)"
          strokeWidth="1.5"
        />
        {RADAR_VALUES.map((value, index) => {
          const point = radarPoint(index, value);
          return <circle key={index} cx={point.x} cy={point.y} r="2.6" fill="var(--gold)" />;
        })}
      </svg>
    </div>
  );
}

function DraftBoardMock() {
  return (
    <div
      aria-hidden="true"
      className="flex h-64 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-3"
    >
      <div className="mb-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <Landmark className="size-3 text-gold" />
          Draft board
        </span>
        <Lock className="size-3 text-gold" />
      </div>
      <ul className="flex flex-1 flex-col gap-1.5">
        {DRAFT_ROWS.map((row) => (
          <li
            key={row.office}
            className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2"
          >
            <span className="min-w-0 truncate text-[11px] text-zinc-300">{row.office}</span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-[11px] text-gold">{row.amount}</span>
              <span className="block text-[9px] uppercase tracking-widest text-zinc-500">
                {row.status}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        <FileCheck className="size-3 text-gold" />
        Unlocks on filing
      </p>
    </div>
  );
}

function CivicGateMock() {
  return (
    <div
      aria-hidden="true"
      className="flex h-64 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-3"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        <Scale className="size-3 text-gold" />
        Local appeal
      </div>
      <p className="font-display text-sm text-parchment">Rezone Riverside</p>
      <p className="mt-1 text-[11px] text-zinc-500">Ward ballot · constituents only</p>
      <ul className="mt-4 flex flex-1 flex-col justify-center gap-1.5">
        <li className="flex items-center justify-between gap-2 rounded-md border border-gold/40 bg-gold/10 px-2.5 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-parchment">
            <ShieldCheck className="size-3.5 text-gold" />
            Tier 2 constituent
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-gold">Vote</span>
        </li>
        <li className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 px-2.5 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
            <Lock className="size-3.5" />
            Outside the division
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">
            Read
          </span>
        </li>
      </ul>
    </div>
  );
}

const FEATURES = [
  {
    title: "Civic-Gated Debates",
    body: "Tier 2 verification ties a person to a real address and the civic divisions around it. Local appeals only take ballots from constituents inside that fence. Everyone else can read the floor. They cannot decide it.",
    visual: <CivicGateMock />,
  },
  {
    title: "6-Axis Ideology Vector",
    body: "Stances are scored across six policy axes and stored as a coordinate in that space. Viability is the distance between your point and a district, rather than a binary party label.",
    visual: <IdeologyRadarMock />,
  },
  {
    title: "Draft Board & Bounties",
    body: "Back someone before they file. Supporters vault a conditional Stripe escrow that stays locked until the candidate formally files the legal compliance forms the seat requires.",
    visual: <DraftBoardMock />,
  },
] as const;

export default async function Home() {
  const user = await getServerUser();
  if (user) {
    redirect("/feed");
  }

  return (
    <main className="relative flex min-h-full w-full flex-1 flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--gold)_16%,transparent),transparent_68%)]" />

      <section className="relative mx-auto flex w-full max-w-4xl flex-col items-start px-6 pb-16 pt-20 sm:pt-28">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-gold">
          Public arena
        </p>
        <h1 className="mt-5 max-w-3xl font-display text-5xl font-semibold leading-[1.05] tracking-tight text-parchment sm:text-6xl lg:text-7xl">
          Don&apos;t Just Vote. <span className="text-gold">Draft.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
          A decentralized civic platform to debate policy, mathematically prove your
          viability, and unlock campaign escrow bounties before you ever file to run.
        </p>
        <Button
          asChild
          variant="gold"
          size="lg"
          className="mt-10 h-auto min-h-14 max-w-full whitespace-normal px-8 py-4 text-center text-xs leading-5 sm:text-sm"
        >
          <Link href="/auth/login">Verify Your District &amp; Enter the Arena</Link>
        </Button>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="border-t border-gold/30 pt-14">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
            The mechanics
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            How the arena decides
          </h2>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="flex flex-col gap-5 rounded-xl border border-gold/40 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
            >
              {feature.visual}
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight text-parchment">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-zinc-400">{feature.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
