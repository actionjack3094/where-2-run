import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { formatVector, gradeDebateText } from "./grader.ts";

type ArgumentRecord = {
  id?: string;
  debate_id?: string;
  author_id?: string;
  content?: string;
  graded_at?: string | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: ArgumentRecord;
  new_row?: ArgumentRecord;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceRoleKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  try {
    const parsed = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<
      string,
      string
    >;
    return parsed.default ?? Object.values(parsed)[0] ?? "";
  } catch {
    return "";
  }
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const key = serviceRoleKey();
  if (!supabaseUrl || !key) {
    throw new Error("Missing SUPABASE_URL or service role key");
  }
  return createClient(supabaseUrl, key);
}

function unwrapRecord(payload: WebhookPayload & ArgumentRecord): ArgumentRecord | null {
  const record = payload.record ?? payload.new_row ?? payload;
  if (!record?.id || !record?.author_id || !record?.content || !record?.debate_id) return null;
  return record;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = (await req.json()) as WebhookPayload & ArgumentRecord;
    const record = unwrapRecord(payload);
    if (!record?.id || !record.author_id || !record.content || !record.debate_id) {
      return json({ error: "Missing argument record" }, 400);
    }
    if (record.graded_at) {
      return json({ ok: true, skipped: "already_graded" });
    }

    const admin = createAdminClient();

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
    if (!author) return json({ error: "Author not found" }, 404);
    if (!debate) return json({ error: "Debate not found" }, 404);

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
    const vectorLiteral = formatVector(grade.nextVector);
    const gradedAt = new Date().toISOString();

    const { data: claimed, error: claimError } = await admin
      .from("arguments")
      .update({ graded_at: gradedAt })
      .eq("id", record.id)
      .is("graded_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) {
      return json({ ok: true, skipped: "already_graded" });
    }

    const { error: userError } = await admin
      .from("users")
      .update({
        ideology_vector: vectorLiteral,
        updated_at: gradedAt,
      })
      .eq("id", author.id);

    if (userError) throw userError;

    try {
      await admin.rpc("complete_expired_debates");
      await admin.rpc("apply_debate_elo", { debate_uuid: record.debate_id });
    } catch (eloError) {
      console.error("ELO update failed after grading", eloError);
    }

    return json({
      ok: true,
      author_id: author.id,
      ideology_vector: vectorLiteral,
      delta: grade.delta,
      troll_score: grade.trollScore,
      quality: grade.quality,
      note: grade.note,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not grade the filing.";
    console.error("grade-debate failed", message);
    return json({ error: message }, 500);
  }
});
