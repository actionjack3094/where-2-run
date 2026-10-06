import { isMissingSchema } from "@/lib/db/schema-errors";
import { displayName, platformAdmin, type PlatformAdmin } from "@/lib/platform/records";
import type { Primary } from "@/types/database.types";

export type DebaterQueueItem = {
  id: string;
  status: string;
  prompt: string;
  office: string;
  role: string;
  opponent: string;
};

export type SoapboxStat = {
  id: string;
  content: string;
  tags: string[];
  upvotes: number;
  createdAt: string;
};

export type SoapboxAnalytics = {
  posts: SoapboxStat[];
  totalUpvotes: number;
  tagCounts: { tag: string; count: number }[];
};

function raceOffice(primary: Primary | undefined) {
  if (!primary) return "Primary";
  const seat = primary.district ? `${primary.state}-${primary.district}` : primary.state;
  return `${seat} · ${primary.office_name}`;
}

export async function loadDebaterQueue(userId: string): Promise<DebaterQueueItem[]> {
  const admin = platformAdmin();
  const debates = await admin
    .from("arena_debates")
    .select("id, primary_id, prompt_id, candidate_a_id, candidate_b_id, status, created_at")
    .or(`candidate_a_id.eq.${userId},candidate_b_id.eq.${userId}`)
    .in("status", ["open_challenge", "active", "pending_acceptance"])
    .order("created_at", { ascending: false });
  if (debates.error) {
    if (isMissingSchema(debates.error)) return [];
    throw new Error(debates.error.message);
  }
  const rows = (debates.data ?? []) as {
    id: string;
    primary_id: string;
    prompt_id: string;
    candidate_a_id: string;
    candidate_b_id: string | null;
    status: string;
  }[];
  if (rows.length === 0) return [];

  const promptIds = rows.map((row) => row.prompt_id);
  const primaryIds = [...new Set(rows.map((row) => row.primary_id))];
  const opponentIds = rows.map((row) =>
    row.candidate_a_id === userId ? row.candidate_b_id : row.candidate_a_id,
  );
  const [prompts, primaries, profiles] = await Promise.all([
    admin.from("debate_prompts").select("id, prompt_text").in("id", promptIds),
    admin.from("primaries").select("id, office_name, state, district").in("id", primaryIds),
    admin
      .from("profiles")
      .select("id, display_name, full_name, legal_name")
      .in(
        "id",
        opponentIds.filter((id): id is string => Boolean(id)),
      ),
  ]);
  const promptText = new Map(
    ((prompts.data ?? []) as { id: string; prompt_text: string }[]).map((row) => [row.id, row.prompt_text]),
  );
  const offices = new Map(
    ((primaries.data ?? []) as Pick<Primary, "id" | "office_name" | "state" | "district">[]).map((row) => [
      row.id,
      raceOffice(row as Primary),
    ]),
  );
  const names = new Map(
    ((profiles.data ?? []) as {
      id: string;
      display_name: string | null;
      full_name: string | null;
      legal_name: string | null;
    }[]).map((row) => [row.id, row.legal_name?.trim() || displayName(row)]),
  );

  return rows.map((row) => {
    const opponentId = row.candidate_a_id === userId ? row.candidate_b_id : row.candidate_a_id;
    const role =
      row.status === "pending_acceptance"
        ? "Waiting on acceptance"
        : row.status === "active"
          ? row.candidate_a_id === userId
            ? "Seat locked"
            : "Rebuttal due"
          : "Opening stance";
    return {
      id: row.id,
      status: row.status,
      prompt: promptText.get(row.prompt_id) ?? "Open question",
      office: offices.get(row.primary_id) ?? "Primary",
      role,
      opponent: opponentId ? names.get(opponentId) ?? "Open seat" : "Open seat",
    };
  });
}

export async function loadSoapboxAnalytics(userId: string): Promise<SoapboxAnalytics> {
  const admin = platformAdmin();
  const posts = await admin
    .from("soapbox_posts")
    .select("id, content, tags, upvote_count, created_at")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });
  if (posts.error) {
    if (isMissingSchema(posts.error)) return { posts: [], totalUpvotes: 0, tagCounts: [] };
    throw new Error(posts.error.message);
  }
  const rows = (posts.data ?? []) as {
    id: string;
    content: string;
    tags: string[] | null;
    upvote_count: number | null;
    created_at: string;
  }[];
  const speech: SoapboxStat[] = rows.map((row) => ({
    id: row.id,
    content: row.content,
    tags: row.tags ?? [],
    upvotes: row.upvote_count ?? 0,
    createdAt: row.created_at,
  }));
  const tags = new Map<string, number>();
  for (const post of speech) {
    for (const tag of post.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }
  return {
    posts: speech,
    totalUpvotes: speech.reduce((sum, post) => sum + post.upvotes, 0),
    tagCounts: [...tags.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
  };
}

export async function loadRoadmapInputs(admin: PlatformAdmin, userId: string) {
  const [debates, standings, targets] = await Promise.all([
    admin
      .from("arena_debates")
      .select("id", { count: "exact", head: true })
      .eq("status", "concluded")
      .or(`candidate_a_id.eq.${userId},candidate_b_id.eq.${userId}`),
    admin
      .from("primary_standings")
      .select("civic_standing, pledged_war_chest, is_nominee")
      .eq("user_id", userId),
    admin
      .from("campaign_targets")
      .select("pledged_escrow, official_candidate_id, status")
      .eq("user_id", userId),
  ]);

  let concludedDebates = debates.count ?? 0;
  if (debates.error && !isMissingSchema(debates.error)) throw new Error(debates.error.message);
  if (debates.error) concludedDebates = 0;

  let civicStanding = 0;
  let pledged = 0;
  let filed = false;
  if (!standings.error) {
    for (const row of (standings.data ?? []) as {
      civic_standing: number | null;
      pledged_war_chest: number | string | null;
      is_nominee: boolean | null;
    }[]) {
      civicStanding = Math.max(civicStanding, row.civic_standing ?? 0);
      pledged += Number(row.pledged_war_chest ?? 0);
      if (row.is_nominee) filed = true;
    }
  } else if (!isMissingSchema(standings.error)) {
    throw new Error(standings.error.message);
  }

  if (!targets.error) {
    for (const row of (targets.data ?? []) as {
      pledged_escrow: number | string | null;
      official_candidate_id: string | null;
      status: string | null;
    }[]) {
      pledged += Number(row.pledged_escrow ?? 0);
      if (row.official_candidate_id?.trim() || row.status === "filed") filed = true;
    }
  } else if (!isMissingSchema(targets.error)) {
    throw new Error(targets.error.message);
  }

  const gauntlet = await admin
    .from("gauntlet_stances")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const gauntletFiled = gauntlet.error ? 0 : (gauntlet.count ?? 0);

  return { concludedDebates, civicStanding, pledged, filed, gauntletFiled };
}
