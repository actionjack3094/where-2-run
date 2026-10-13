"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { cleanRoundText } from "@/lib/debates/structure";
import { loadDistrictGauntlet } from "@/lib/debates/load-gauntlet";
import { platformAdmin } from "@/lib/platform/records";

export async function fileGauntletStance(primaryId: string, promptId: string, content: string) {
  try {
    if (!isUuid(primaryId) || !isUuid(promptId)) return { error: "That issue is not on the gauntlet." };
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to file the District Gauntlet." };
    const admin = platformAdmin();
    const gauntlet = await loadDistrictGauntlet(userId, admin);
    if (!gauntlet || gauntlet.primaryId !== primaryId) {
      return { error: "The District Gauntlet is closed for this race." };
    }
    if (!gauntlet.prompts.some((prompt) => prompt.id === promptId)) {
      return { error: "File a stance on one of the top three queued issues." };
    }
    const cleaned = cleanRoundText(content, "Gauntlet stance");
    if ("error" in cleaned) return { error: cleaned.error };

    const inserted = await admin.from("gauntlet_stances").upsert(
      {
        user_id: userId,
        primary_id: primaryId,
        prompt_id: promptId,
        content: cleaned.text,
      },
      { onConflict: "user_id,prompt_id" },
    );
    if (inserted.error) {
      if (isMissingSchema(inserted.error)) return { error: "Apply the phase 2 migration, then reload." };
      return { error: inserted.error.message };
    }
    revalidatePath("/debates");
    revalidatePath("/campaign");
    revalidatePath("/campaign-hub");
    return { message: "Gauntlet stance filed." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not file that stance." };
  }
}
