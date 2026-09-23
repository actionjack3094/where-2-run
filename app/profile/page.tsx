"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadProfileHub } from "@/app/actions/profile/load-hub";
import { AboutMe } from "@/app/profile/components/AboutMe";
import { CampaignHub } from "@/app/profile/components/CampaignHub";
import { Tier2Verification } from "@/app/profile/components/Tier2Verification";
import type { ProfileHubData } from "@/lib/profile/hub";
import { cn } from "@/lib/utils";

const TABS = ["About Me", "Campaign Hub"] as const;

export default function MyProfilePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("About Me");
  const [hub, setHub] = useState<ProfileHubData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadProfileHub()
      .then((next) => {
        if (cancelled) return;
        if (!next.signedIn) {
          router.replace("/onboarding");
          return;
        }
        setHub(next);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setLoadError(
          caught instanceof Error ? caught.message : "Could not open this profile.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              My Profile
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
              {hub?.username ?? "Profile"}
            </h1>
          </div>
          {hub ? (
            <Link
              href={`/profile/${hub.userId}`}
              className="text-[11px] font-medium uppercase tracking-widest text-gold hover:text-parchment"
            >
              Public profile
            </Link>
          ) : null}
        </header>

        {hub ? (
          <div className="mt-8">
            <Tier2Verification />
          </div>
        ) : null}

        <div
          role="tablist"
          aria-label="Profile sections"
          className="mt-8 flex flex-wrap gap-2"
        >
          {TABS.map((tab) => {
            const selected = activeTab === tab;
            const tabId = tab === "About Me" ? "tab-about-me" : "tab-campaign-hub";
            const panelId = tab === "About Me" ? "panel-about-me" : "panel-campaign-hub";
            return (
              <button
                key={tab}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest transition-colors",
                  selected
                    ? "bg-gold-strong text-zinc-950"
                    : "border border-gold/40 text-zinc-400 hover:border-gold hover:text-parchment",
                )}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {loadError ? (
          <p className="mt-8 text-sm leading-6 text-zinc-400" role="alert">
            Could not load this profile. {loadError}
          </p>
        ) : !hub ? (
          <p className="mt-8 text-sm leading-6 text-zinc-400">Opening your profile…</p>
        ) : (
          <>
            {hub.error ? (
              <p className="mt-8 text-sm leading-6 text-zinc-400">{hub.error}</p>
            ) : null}
            {activeTab === "About Me" ? (
              <div id="panel-about-me" role="tabpanel" aria-labelledby="tab-about-me">
                <AboutMe
                  profile={hub}
                  onVectorUpdated={(ideologyVector) =>
                    setHub((current) => (current ? { ...current, ideologyVector } : current))
                  }
                />
              </div>
            ) : (
              <div id="panel-campaign-hub" role="tabpanel" aria-labelledby="tab-campaign-hub">
                <CampaignHub profile={hub} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
