import Link from "next/link";
import type { CampaignMilestone } from "@/lib/campaign/milestones";
import { formatUsd } from "@/lib/pledges";
import { cn } from "@/lib/utils";

function metric(item: CampaignMilestone) {
  if (item.id === "escrow") return `${formatUsd(item.current)} of ${formatUsd(item.goal)}`;
  if (item.id === "filing") return item.complete ? "Filed" : "Not filed";
  if (item.id === "civic") return `${Math.round(item.current).toLocaleString("en-US")} / ${item.goal}+`;
  return `${Math.min(item.current, item.goal)} / ${item.goal}`;
}

export function CampaignRoadmap({ milestones }: { milestones: CampaignMilestone[] }) {
  const done = milestones.filter((item) => item.complete).length;

  return (
    <ol className="mt-8 grid gap-4">
      {milestones.map((item, index) => {
        const width =
          item.goal > 0 ? Math.min(100, Math.round((Math.min(item.current, item.goal) / item.goal) * 100)) : 0;
        return (
          <li key={item.id} className="rounded-xl border border-amber-500/30 bg-white px-5 py-5">
            <div className="flex items-start gap-4">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-display text-sm",
                  item.complete
                    ? "border-gold bg-gold-strong text-stone-900"
                    : "border-gold/40 text-amber-800",
                )}
                aria-hidden
              >
                {item.complete ? "✓" : String(index + 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg text-stone-900">{item.title}</h2>
                  <p className="text-sm tabular-nums text-stone-600">{metric(item)}</p>
                </div>
                <p className="mt-1 text-sm leading-6 text-stone-600">{item.detail}</p>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={item.goal}
                  aria-valuenow={Math.min(item.current, item.goal)}
                  aria-label={item.title}
                >
                  <div className="h-full rounded-full bg-gold-strong" style={{ width: `${width}%` }} />
                </div>
              </div>
            </div>
          </li>
        );
      })}
      <li className="text-sm text-stone-600">
        {done} of {milestones.length} milestones cleared.{" "}
        <Link href="/claim" className="text-amber-800">
          File official candidacy
        </Link>
      </li>
    </ol>
  );
}
