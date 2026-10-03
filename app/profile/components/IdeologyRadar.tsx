"use client";

import { IdeologyCompass, compassFromIdeologyVector } from "@/components/IdeologyCompass";
import { IDEOLOGY_COMPASS_TIP, InfoTooltip } from "@/components/InfoTooltip";

export function IdeologyRadar({
  vector,
  name,
  avatarUrl,
}: {
  candidateId?: string;
  vector: unknown;
  name?: string;
  avatarUrl?: string | null;
}) {
  const point = compassFromIdeologyVector(vector);
  return (
    <section aria-labelledby="ideology-compass-heading">
      <h2
        id="ideology-compass-heading"
        className="inline-flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-parchment"
      >
        Ideology Compass
        <InfoTooltip label="Ideology Compass" text={IDEOLOGY_COMPASS_TIP} />
      </h2>
      <div className="mt-4">
        <IdeologyCompass
          points={[{ ...point, name, avatarUrl }]}
        />
      </div>
    </section>
  );
}
