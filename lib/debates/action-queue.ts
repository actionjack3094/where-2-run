import { isMissingSchema } from "@/lib/db/schema-errors";
import { platformAdmin } from "@/lib/platform/records";

export type OpenChallenge = {
  id: string;
  stance: string;
  office: string;
  party: string;
  createdAt: string;
};

export type UnansweredQuestion = {
  id: string;
  title: string;
  content: string;
  office: string;
  primarySlug: string | null;
  createdAt: string;
};

export type ActionQueue = {
  challenges: OpenChallenge[];
  questions: UnansweredQuestion[];
  notice: string | null;
};

function excerpt(value: string, max = 220) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export async function loadActionQueue(): Promise<ActionQueue> {
  try {
    const admin = platformAdmin();
    const [challenges, questions] = await Promise.all([
      loadOpenChallenges(admin),
      loadUnansweredQuestions(admin),
    ]);
    return {
      challenges: challenges.rows,
      questions: questions.rows,
      notice: challenges.notice ?? questions.notice,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load the action queue.";
    return {
      challenges: [],
      questions: [],
      notice: isMissingSchema({ message }) ? "Apply the platform architecture migration, then reload." : message,
    };
  }
}

async function loadOpenChallenges(admin: ReturnType<typeof platformAdmin>) {
  const result = await admin
    .from("arena_debates")
    .select("id, stance_a, primary_id, created_at")
    .eq("status", "open_challenge")
    .is("candidate_b_id", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (result.error) {
    if (isMissingSchema(result.error)) return { rows: [], notice: "Apply the platform architecture migration, then reload." };
    throw new Error(result.error.message);
  }

  const rows = (result.data ?? []) as {
    id: string;
    stance_a: string;
    primary_id: string;
    created_at: string;
  }[];
  const primaries = await primaryLookup(
    admin,
    rows.map((row) => row.primary_id),
  );

  return {
    notice: null,
    rows: rows.map((row) => {
      const primary = primaries.get(row.primary_id);
      return {
        id: row.id,
        stance: excerpt(row.stance_a),
        office: primary?.office ?? "Primary",
        party: primary?.party === "republican" ? "Republican" : "Democrat",
        createdAt: row.created_at,
      };
    }),
  };
}

async function loadUnansweredQuestions(admin: ReturnType<typeof platformAdmin>) {
  const prompts = await admin
    .from("community_prompts")
    .select("id, primary_id, title, content, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  if (prompts.error) {
    if (isMissingSchema(prompts.error)) {
      return { rows: [], notice: "Apply the constituent agenda migration, then reload." };
    }
    throw new Error(prompts.error.message);
  }

  const fresh = (prompts.data ?? []) as {
    id: string;
    primary_id: string;
    title: string;
    content: string;
    created_at: string;
  }[];
  const ids = fresh.map((row) => row.id);
  const answered = new Set<string>();
  if (ids.length > 0) {
    const sources = await admin
      .from("debate_prompts")
      .select("source_prompt_id")
      .in("source_prompt_id", ids);
    if (!sources.error) {
      for (const row of (sources.data ?? []) as { source_prompt_id: string | null }[]) {
        if (row.source_prompt_id) answered.add(row.source_prompt_id);
      }
    }
  }

  const waiting = fresh.filter((row) => !answered.has(row.id)).slice(0, 20);
  const primaries = await primaryLookup(
    admin,
    waiting.map((row) => row.primary_id),
  );

  return {
    notice: null,
    rows: waiting.map((row) => {
      const primary = primaries.get(row.primary_id);
      return {
        id: row.id,
        title: row.title.trim() || "Constituent question",
        content: excerpt(row.content, 280),
        office: primary?.office ?? "Primary",
        primarySlug: primary?.slug ?? null,
        createdAt: row.created_at,
      };
    }),
  };
}

async function primaryLookup(admin: ReturnType<typeof platformAdmin>, ids: string[]) {
  const unique = [...new Set(ids)];
  const map = new Map<string, { office: string; party: string; slug: string }>();
  if (unique.length === 0) return map;
  const result = await admin.from("primaries").select("id, office_name, party, slug").in("id", unique);
  if (result.error) return map;
  for (const row of (result.data ?? []) as {
    id: string;
    office_name: string;
    party: string;
    slug: string;
  }[]) {
    map.set(row.id, { office: row.office_name, party: row.party, slug: row.slug });
  }
  return map;
}
