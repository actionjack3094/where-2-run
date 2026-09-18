import type { SupabaseClient } from "@supabase/supabase-js";
import { formatVector, gradeDebateText } from "@/lib/ideology/grade";
import type { Database } from "@/types/database.types";

type AdminClient = SupabaseClient<Database>;

type ArgumentRecord = {
  id: string;
  debate_id: string;
  author_id: string;
  content: string;
  graded_at?: string | null;
};

export async function applyDebateGrade(
  admin: AdminClient,
  record: ArgumentRecord,
) {
  if (record.graded_at) {
    return { skipped: "already_graded" as const };
  }

  const gradedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("arguments")
    .update({ graded_at: gradedAt })
    .eq("id", record.id)
    .is("graded_at", null)
    .select("id")
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claimed) return { skipped: "already_graded" as const };

  const [{ data: author, error: authorError }, { data: debate, error: debateError }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, ideology_vector, target_district_id")
        .eq("id", record.author_id)
        .maybeSingle(),
      admin
        .from("debates")
        .select("id, topic, district_id")
        .eq("id", record.debate_id)
        .maybeSingle(),
    ]);

  if (authorError) throw authorError;
  if (debateError) throw debateError;
  if (!author || !debate) return { skipped: "missing_context" as const };

  const districtId = debate.district_id ?? author.target_district_id;
  let districtMedian: unknown = null;
  if (districtId) {
    const { data: district, error: districtError } = await admin
      .from("districts")
      .select("id, median_ideology_vector")
      .eq("id", districtId)
      .maybeSingle();
    if (districtError) throw districtError;
    districtMedian = district?.median_ideology_vector ?? null;
  }

  const grade = gradeDebateText(
    record.content,
    debate.topic ?? "",
    author.ideology_vector,
    districtMedian,
  );

  const { error: userError } = await admin
    .from("users")
    .update({
      ideology_vector: formatVector(grade.nextVector),
      updated_at: gradedAt,
    })
    .eq("id", author.id);

  if (userError) throw userError;

  return {
    skipped: null,
    author_id: author.id,
    ideology_vector: formatVector(grade.nextVector),
    note: grade.note,
  };
}
