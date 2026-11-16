import type { Metadata } from "next";
import { CalibrationLab } from "@/app/townhall/calibration-lab";
import { GuestCalibration } from "@/app/townhall/guest-calibration";
import { formatDistrictLabel } from "@/lib/ballot/district-label";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import {
  CALIBRATION_QUESTIONS,
  CONFIDENCE_FLOOR,
  presentWedge,
  readCalibrationAnswered,
} from "@/lib/townhall/calibration";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Townhall · WHERE 2 RUN",
  description:
    "Wedge questions move your ideology vector and raise Ideological Confidence from 68% toward 96%.",
};

export default async function TownhallPage() {
  const user = await getServerUser();
  if (!user) return <GuestCalibration />;

  const loaded = await loadLab(user.id);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">
            Calibration Lab
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
            Townhall
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            One wedge question at a time. An answer nudges your vector and adds 4 points of
            Ideological Confidence, up to 96%. Live district debates cover the last stretch.
            Skip Topic leaves the vector where it is.
          </p>
        </header>
        <CalibrationLab
          initial={loaded.snapshot}
          cards={loaded.cards}
          previouslyFiled={loaded.previouslyFiled}
        />
      </div>
    </main>
  );
}

async function loadLab(userId: string) {
  const snapshot = {
    x: 0,
    y: 0,
    confidence: CONFIDENCE_FLOOR,
    placed: false,
  };
  let districtLabel: string | null = null;
  let answered: string[] = [];

  try {
    const admin = createAdminClient();
    let profile = await admin
      .from("profiles")
      .select("ideology_x, ideology_y, confidence_score, state_code, congressional_district")
      .eq("id", userId)
      .maybeSingle();
    if (profile.error && isMissingSchema(profile.error)) {
      profile = await admin
        .from("profiles")
        .select("ideology_x, ideology_y, state_code, congressional_district")
        .eq("id", userId)
        .maybeSingle();
    }
    if (profile.error) throw new Error(profile.error.message);

    const row = profile.data as {
      ideology_x: number | null;
      ideology_y: number | null;
      confidence_score?: number | null;
      state_code: string | null;
      congressional_district: string | null;
    } | null;

    if (row?.ideology_x != null && row.ideology_y != null) {
      snapshot.x = row.ideology_x;
      snapshot.y = row.ideology_y;
      snapshot.placed = true;
    }
    if (typeof row?.confidence_score === "number" && Number.isFinite(row.confidence_score)) {
      snapshot.confidence = row.confidence_score;
    }
    districtLabel = formatDistrictLabel(row?.state_code, row?.congressional_district);

    const ideology = await admin
      .from("user_ideologies")
      .select("vector_data")
      .eq("user_id", userId)
      .maybeSingle();
    if (!ideology.error) answered = readCalibrationAnswered(ideology.data?.vector_data);
  } catch (caught) {
    console.error(
      "Could not load the Townhall.",
      caught instanceof Error ? caught.message : "Unknown error",
    );
  }

  const seen = new Set(answered);
  return {
    snapshot,
    previouslyFiled: answered.length > 0,
    cards: CALIBRATION_QUESTIONS.filter((question) => !seen.has(question.id)).map((question) =>
      presentWedge(question, districtLabel),
    ),
  };
}
