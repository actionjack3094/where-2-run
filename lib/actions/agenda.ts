"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { cleanAgendaContent, cleanAgendaTitle } from "@/lib/platform/agenda";
import { primaryClosed } from "@/lib/platform/cycle";
import { loadProfile, platformAdmin } from "@/lib/platform/records";
import type { Primary } from "@/types/database.types";

export type AgendaResult = {
  error?: string;
  message?: string;
  count?: number;
  upvoted?: boolean;
};

async function verifiedVoter() {
  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to take part in the district agenda.", userId: null, admin: null };
  const admin = platformAdmin();
  const profile = await loadProfile(admin, userId);
  if (!profile?.is_verified) {
    return { error: "Stripe verification is required to file or upvote an issue.", userId, admin };
  }
  return { error: null, userId, admin };
}

async function refreshPrimary(admin: ReturnType<typeof platformAdmin>, primaryId: string) {
  const { data } = await admin.from("primaries").select("slug").eq("id", primaryId).maybeSingle();
  const slug = (data as { slug: string } | null)?.slug;
  if (slug) {
    revalidatePath(`/elections/${slug}`);
    revalidatePath(`/primaries/${slug}`);
    revalidatePath(`/debates/create`);
  }
  revalidatePath("/elections");
  revalidatePath("/primaries");
}

export async function submitCommunityPrompt(
  primaryId: string,
  titleText: string,
  contentText: string,
): Promise<AgendaResult> {
  if (!isUuid(primaryId)) return { error: "That primary is not on the board." };
  const title = cleanAgendaTitle(titleText);
  const content = cleanAgendaContent(contentText);
  if (!title) return { error: "The title needs 100 characters or fewer." };
  if (!content) return { error: "The description needs 500 characters or fewer." };

  const gate = await verifiedVoter();
  if (!gate.userId || !gate.admin) return { error: gate.error ?? "Sign in to take part in the district agenda." };
  if (gate.error) return { error: gate.error };

  const primary = await gate.admin.from("primaries").select("id, status, primary_date, slug").eq("id", primaryId).maybeSingle();
  if (primary.error) {
    if (isMissingSchema(primary.error)) return { error: "Apply the constituent agenda migration, then reload." };
    return { error: primary.error.message };
  }
  const row = primary.data as Pick<Primary, "id" | "status" | "primary_date" | "slug"> | null;
  if (!row) return { error: "That primary is not on the board." };
  if (primaryClosed(row)) return { error: "This primary has closed. The agenda is locked." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("community_prompts").insert({
    primary_id: primaryId,
    voter_id: gate.userId,
    title,
    content,
  });
  if (error) {
    if (isMissingSchema(error)) return { error: "Apply the constituent agenda migration, then reload." };
    return { error: error.message };
  }

  await refreshPrimary(gate.admin, primaryId);
  return { message: "Issue filed." };
}

export async function togglePromptUpvote(promptId: string): Promise<AgendaResult> {
  if (!isUuid(promptId)) return { error: "That issue is not on the agenda." };
  const gate = await verifiedVoter();
  if (!gate.userId || !gate.admin) return { error: gate.error ?? "Sign in to take part in the district agenda." };
  if (gate.error) return { error: gate.error };

  const prompt = await gate.admin
    .from("community_prompts")
    .select("id, primary_id")
    .eq("id", promptId)
    .maybeSingle();
  if (prompt.error) {
    if (isMissingSchema(prompt.error)) return { error: "Apply the constituent agenda migration, then reload." };
    return { error: prompt.error.message };
  }
  const issue = prompt.data as { id: string; primary_id: string } | null;
  if (!issue) return { error: "That issue is not on the agenda." };

  const supabase = await createServerSupabase();
  const existing = await supabase
    .from("prompt_upvotes")
    .select("prompt_id")
    .eq("prompt_id", promptId)
    .eq("voter_id", gate.userId)
    .maybeSingle();
  if (existing.error) return { error: existing.error.message };

  if (existing.data) {
    const removed = await supabase
      .from("prompt_upvotes")
      .delete()
      .eq("prompt_id", promptId)
      .eq("voter_id", gate.userId);
    if (removed.error) return { error: removed.error.message };
  } else {
    const inserted = await supabase.from("prompt_upvotes").insert({
      prompt_id: promptId,
      voter_id: gate.userId,
    });
    if (inserted.error) return { error: inserted.error.message };
  }

  const counted = await gate.admin
    .from("community_prompts")
    .select("upvote_count")
    .eq("id", promptId)
    .maybeSingle();
  if (counted.error) return { error: counted.error.message };
  const count = (counted.data as { upvote_count: number } | null)?.upvote_count ?? 0;

  await refreshPrimary(gate.admin, issue.primary_id);
  return { count, upvoted: !existing.data };
}
