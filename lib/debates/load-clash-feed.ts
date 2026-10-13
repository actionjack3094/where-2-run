import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  excerpt,
  formatOfficeTag,
  latestSideText,
  orderClashFeed,
  TEXAS_MEDICAID_DEBATE_ID,
  type ClashCard,
} from "@/lib/debates/clash-feed";
import {
  asTier,
  displayName,
  loadProfiles,
  platformAdmin,
  type PlatformProfile,
} from "@/lib/platform/records";
import type { Party } from "@/lib/platform/scoring";

const CLASH_COLUMNS =
  "id, primary_id, prompt_id, candidate_a_id, candidate_b_id, stance_a, stance_b, status, updated_at";

const SEATED = ["active", "pending_acceptance", "concluded"] as const;

type DebateRow = {
  id: string;
  primary_id: string;
  prompt_id: string;
  candidate_a_id: string;
  candidate_b_id: string | null;
  stance_a: string;
  stance_b: string | null;
  status: string;
  updated_at: string;
};

type PromptRow = {
  id: string;
  prompt_text: string;
  source_prompt_id: string | null;
};

type PrimaryRow = {
  id: string;
  office_name: string;
  state: string;
  party: string;
};

type ArgumentRow = {
  debate_id: string;
  author_id: string;
  round_number: number;
  content: string;
};

export type ClashFeed = {
  cards: ClashCard[];
  notice: string | null;
};

function partyOf(value: string): Party {
  return value === "republican" ? "republican" : "democrat";
}

function seated(row: DebateRow): row is DebateRow & { candidate_b_id: string } {
  return Boolean(row.candidate_b_id) && SEATED.includes(row.status as (typeof SEATED)[number]);
}

async function loadDebateRows() {
  const admin = platformAdmin();
  const [list, featured] = await Promise.all([
    admin
      .from("arena_debates")
      .select(CLASH_COLUMNS)
      .not("candidate_b_id", "is", null)
      .in("status", [...SEATED])
      .order("updated_at", { ascending: false })
      .limit(40),
    admin.from("arena_debates").select(CLASH_COLUMNS).eq("id", TEXAS_MEDICAID_DEBATE_ID).maybeSingle(),
  ]);
  if (list.error) throw new Error(list.error.message);
  if (featured.error && !isMissingSchema(featured.error)) throw new Error(featured.error.message);

  const rows = ((list.data ?? []) as DebateRow[]).filter(seated);
  const pinned = featured.data ? (featured.data as DebateRow) : null;
  if (pinned && seated(pinned) && !rows.some((row) => row.id === pinned.id)) {
    rows.unshift(pinned);
  }
  return { admin, rows };
}

function countBy(rows: { debate_id?: string; id?: string }[], key: "debate_id") {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row[key];
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export async function loadClashFeed(): Promise<ClashFeed> {
  try {
    const { admin, rows } = await loadDebateRows();
    if (rows.length === 0) return { cards: orderClashFeed([]), notice: null };

    const promptIds = [...new Set(rows.map((row) => row.prompt_id))];
    const primaryIds = [...new Set(rows.map((row) => row.primary_id))];
    const debateIds = rows.map((row) => row.id);

    const [prompts, primaries, argumentsResult, questions, votes] = await Promise.all([
      admin.from("debate_prompts").select("id, prompt_text, source_prompt_id").in("id", promptIds),
      admin.from("primaries").select("id, office_name, state, party").in("id", primaryIds),
      admin
        .from("arguments")
        .select("debate_id, author_id, round_number, content")
        .in("debate_id", debateIds),
      admin.from("constituent_questions").select("debate_id").in("debate_id", debateIds),
      admin.from("debate_votes").select("debate_id").in("debate_id", debateIds),
    ]);

    if (prompts.error && !isMissingSchema(prompts.error)) throw new Error(prompts.error.message);
    if (primaries.error && !isMissingSchema(primaries.error)) throw new Error(primaries.error.message);

    const promptRows = (prompts.error ? [] : (prompts.data ?? [])) as PromptRow[];
    const promptById = new Map(promptRows.map((row) => [row.id, row]));
    const sourceIds = promptRows.map((row) => row.source_prompt_id).filter((id): id is string => Boolean(id));
    const upvotes = new Map<string, number>();
    if (sourceIds.length > 0) {
      const community = await admin.from("community_prompts").select("id, upvote_count").in("id", sourceIds);
      if (!community.error) {
        for (const row of (community.data ?? []) as { id: string; upvote_count: number | null }[]) {
          upvotes.set(row.id, row.upvote_count ?? 0);
        }
      }
    }

    const primaryById = new Map(
      ((primaries.error ? [] : primaries.data ?? []) as PrimaryRow[]).map((row) => [row.id, row]),
    );
    const argumentRows = (
      argumentsResult.error || isMissingSchema(argumentsResult.error) ? [] : (argumentsResult.data ?? [])
    ) as ArgumentRow[];
    const argumentsByDebate = new Map<string, ArgumentRow[]>();
    for (const row of argumentRows) {
      const list = argumentsByDebate.get(row.debate_id) ?? [];
      list.push(row);
      argumentsByDebate.set(row.debate_id, list);
    }
    const questionCounts = questions.error ? new Map<string, number>() : countBy((questions.data ?? []) as { debate_id: string }[], "debate_id");
    const resonanceCounts = votes.error ? new Map<string, number>() : countBy((votes.data ?? []) as { debate_id: string }[], "debate_id");

    const profiles = await loadProfiles(
      admin,
      rows.flatMap((row) => [row.candidate_a_id, row.candidate_b_id ?? ""]),
    );

    const cards = rows.map((row) =>
      toCard(row, {
        prompt: promptById.get(row.prompt_id),
        primary: primaryById.get(row.primary_id),
        profiles,
        arguments: argumentsByDebate.get(row.id) ?? [],
        upvotes: upvotes.get(promptById.get(row.prompt_id)?.source_prompt_id ?? "") ?? 0,
        resonance: resonanceCounts.get(row.id) ?? 0,
        questionCount: questionCounts.get(row.id) ?? 0,
      }),
    );

    return { cards: orderClashFeed(cards), notice: null };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    const quiet =
      isMissingSchema({ message }) || /missing next_public_supabase|service role/i.test(message);
    return {
      cards: orderClashFeed([]),
      notice: quiet ? null : message || "Debates could not be loaded.",
    };
  }
}

function toCard(
  row: DebateRow & { candidate_b_id: string },
  context: {
    prompt: PromptRow | undefined;
    primary: PrimaryRow | undefined;
    profiles: Map<string, PlatformProfile>;
    arguments: ArgumentRow[];
    upvotes: number;
    resonance: number;
    questionCount: number;
  },
): ClashCard {
  const party = partyOf(context.primary?.party ?? "democrat");
  const filed = context.arguments.map((argument) => ({
    authorId: argument.author_id,
    round: argument.round_number,
    content: argument.content,
  }));
  const side = (id: string, stance: string | null) => {
    const profile = context.profiles.get(id);
    return {
      id,
      name: displayName(profile ?? null),
      avatarUrl: profile?.avatar_url ?? null,
      party,
      tier: asTier(profile?.candidate_tier),
      excerpt: latestSideText(stance, filed, id),
    };
  };

  const question = context.prompt?.prompt_text?.trim() || excerpt(row.stance_a) || "Open question";
  return {
    id: row.id,
    question,
    officeTag: formatOfficeTag(context.primary?.office_name ?? "Primary", context.primary?.state ?? ""),
    href: `/debates/${row.id}`,
    upvotes: context.upvotes,
    resonance: context.resonance,
    questionCount: context.questionCount,
    sideA: side(row.candidate_a_id, row.stance_a),
    sideB: side(row.candidate_b_id, row.stance_b),
  };
}
