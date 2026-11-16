import Link from "next/link";
import { IdeologyCompass, compassFromPlane } from "@/components/IdeologyCompass";
import { IDEOLOGY_COMPASS_TIP, InfoTooltip } from "@/components/InfoTooltip";
import { daysUntilPrimary, formatPrimaryDate } from "@/lib/platform/cycle";
import { formatCoordinate, partyLabel, type PrimaryHub } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

function partyHref(
  target: "democrat" | "republican",
  party: string,
  slug: string,
  counterpartyParty: string | null,
  counterpartySlug: string | null,
) {
  if (party === target) return `/elections/${slug}`;
  if (counterpartyParty === target && counterpartySlug) return `/elections/${counterpartySlug}`;
  return null;
}

export function PrimaryHeader({
  hub,
  section,
}: {
  hub: PrimaryHub;
  section: "board" | "agenda" | "seats";
}) {
  const daysLeft = hub.primaryDate ? daysUntilPrimary(hub.primaryDate) : 0;
  const baseline = compassFromPlane(hub.baselineX, hub.baselineY);
  const parties = [
    { id: "democrat" as const, label: "Democratic Primary", mark: "🔵" },
    { id: "republican" as const, label: "Republican Primary", mark: "🔴" },
  ];
  const tabs = [
    { id: "board" as const, label: "Leaderboard", href: `/elections/${hub.slug}` },
    { id: "agenda" as const, label: "Agenda Queue", href: `/elections/${hub.slug}?tab=agenda` },
    { id: "seats" as const, label: "Voter Q&A", href: `/elections/${hub.slug}?tab=seats` },
  ];

  return (
    <header className="mt-4">
      <nav className="flex flex-wrap gap-2" aria-label="Party primary">
        {parties.map((item) => {
          const href = partyHref(item.id, hub.party, hub.slug, hub.counterpartyParty, hub.counterpartySlug);
          const active = hub.party === item.id;
          const className = active
            ? "rounded-full bg-stone-100 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-900"
            : "rounded-full border border-amber-500/30 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600";
          return href ? (
            <Link key={item.id} href={href} aria-current={active ? "page" : undefined} className={className}>
              {item.mark} {item.label}
            </Link>
          ) : (
            <span key={item.id} className={className}>
              {item.mark} {item.label}
            </span>
          );
        })}
      </nav>
      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-stone-600">{partyLabel(hub.party)} primary</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
        {hub.officeName}
        {hub.district ? ` · ${hub.state}-${hub.district}` : ` · ${hub.state}`}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h2 className="text-sm text-stone-900">Ideology Compass</h2>
        <InfoTooltip label="Ideology Compass" text={IDEOLOGY_COMPASS_TIP} />
      </div>
      <p className="mt-1 text-sm text-stone-600">Primary baseline {formatCoordinate(hub.baselineX, hub.baselineY)}</p>
      <div className="mt-4">
        <IdeologyCompass points={[{ ...baseline }]} />
      </div>
      {hub.primaryDate ? (
        <p className="mt-4 text-sm text-stone-600">
          {hub.closed
            ? `This primary concluded on ${formatPrimaryDate(hub.primaryDate)}. Debates are permanently locked.`
            : `Primary Date: ${formatPrimaryDate(hub.primaryDate)} (${daysLeft} ${daysLeft === 1 ? "day" : "days"} remaining)`}
        </p>
      ) : null}
      <div role="tablist" aria-label="Primary hub" className="mt-8 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            role="tab"
            aria-selected={section === item.id}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
              section === item.id
                ? "bg-gold-strong text-stone-900"
                : "border border-gold/40 text-stone-600 hover:border-gold hover:text-stone-900",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
