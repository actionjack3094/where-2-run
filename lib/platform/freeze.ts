import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  nextFilingClock,
  pickNominee,
  planPrimaryRollovers,
  primaryClosed,
  type NomineeCandidate,
} from "@/lib/platform/cycle";
import { loadPrimaries, platformAdmin, type PlatformAdmin } from "@/lib/platform/records";

export async function closedPrimaryIds(admin: PlatformAdmin, primaryIds: string[]) {
  const closed = new Set<string>();
  const ids = [...new Set(primaryIds.filter(Boolean))];
  if (ids.length === 0) return closed;
  const { data, error } = await admin
    .from("primaries")
    .select("id, status, primary_date")
    .in("id", ids);
  if (error) {
    if (isMissingSchema(error)) return closed;
    throw new Error(error.message);
  }
  for (const row of (data ?? []) as { id: string; status: string | null; primary_date: string | null }[]) {
    if (primaryClosed(row)) closed.add(row.id);
  }
  return closed;
}

async function crownNominee(admin: PlatformAdmin, primaryId: string) {
  const { data, error } = await admin
    .from("primary_standings")
    .select("id, user_id, civic_standing, debates_count")
    .eq("primary_id", primaryId);
  if (error) {
    if (isMissingSchema(error)) return null;
    throw new Error(error.message);
  }
  const standings = (data ?? []) as {
    id: string;
    user_id: string;
    civic_standing: number;
    debates_count: number;
  }[];
  if (standings.length === 0) return null;

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, is_verified, is_synthetic")
    .in("id", standings.map((row) => row.user_id));
  if (profileError) throw new Error(profileError.message);
  const verified = new Set(
    ((profiles ?? []) as { id: string; is_verified: boolean; is_synthetic: boolean }[])
      .filter((row) => row.is_verified && !row.is_synthetic)
      .map((row) => row.id),
  );

  const winner = pickNominee(
    standings.map(
      (row): NomineeCandidate => ({
        id: row.id,
        userId: row.user_id,
        elo: row.civic_standing,
        debatesCount: row.debates_count,
        verified: verified.has(row.user_id),
      }),
    ),
  );

  const { error: clearError } = await admin
    .from("primary_standings")
    .update({ is_nominee: false })
    .eq("primary_id", primaryId)
    .eq("is_nominee", true);
  if (clearError && !isMissingSchema(clearError)) throw new Error(clearError.message);
  if (!winner) return null;

  const { error: crownError } = await admin
    .from("primary_standings")
    .update({ is_nominee: true })
    .eq("id", winner.id);
  if (crownError) throw new Error(crownError.message);
  return winner.userId;
}

/**
 * Freeze every active primary whose date has passed, cancel open challenges,
 * and mark the top verified debater as the party nominee.
 */
export async function freezeDuePrimaries() {
  const admin = platformAdmin();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("primaries")
    .select("id")
    .eq("status", "active")
    .lte("primary_date", now);
  if (error) {
    if (isMissingSchema(error)) return { frozen: 0, nominees: 0, cancelled: 0, rolled: 0 };
    throw new Error(error.message);
  }

  const due = (data ?? []) as { id: string }[];
  let nominees = 0;
  let cancelled = 0;

  for (const primary of due) {
    const closed = await admin
      .from("arena_debates")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("primary_id", primary.id)
      .eq("status", "open_challenge")
      .select("id, prompt_id");
    if (closed.error) {
      if (isMissingSchema(closed.error)) break;
      throw new Error(closed.error.message);
    }
    const debates = (closed.data ?? []) as { id: string; prompt_id: string }[];
    cancelled += debates.length;
    const promptIds = [...new Set(debates.map((row) => row.prompt_id))];
    if (promptIds.length > 0) {
      const { error: promptError } = await admin
        .from("debate_prompts")
        .update({ status: "concluded" })
        .in("id", promptIds)
        .eq("status", "open");
      if (promptError) throw new Error(promptError.message);
    }

    const nominee = await crownNominee(admin, primary.id);
    if (nominee) nominees += 1;

    const { error: freezeError } = await admin
      .from("primaries")
      .update({ status: "frozen" })
      .eq("id", primary.id)
      .eq("status", "active");
    if (freezeError) throw new Error(freezeError.message);
  }

  const rolled = await rolloverClosedPrimaries(admin);
  return { frozen: due.length, nominees, cancelled, rolled };
}

async function rolloverClosedPrimaries(admin: PlatformAdmin) {
  let primaries: Awaited<ReturnType<typeof loadPrimaries>>;
  try {
    primaries = await loadPrimaries(admin);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (isMissingSchema({ message })) return 0;
    throw caught;
  }

  const drafts = planPrimaryRollovers(primaries);
  let rolled = 0;
  for (const draft of drafts) {
    if (draft.party !== "democrat" && draft.party !== "republican") continue;
    const { error } = await admin.from("primaries").insert({
      party: draft.party,
      office_name: draft.office_name,
      state: draft.state,
      district: draft.district,
      ocd_id: draft.ocd_id,
      baseline_x: draft.baseline_x,
      baseline_y: draft.baseline_y,
      slug: draft.slug,
      general_slug: draft.general_slug,
      level: draft.level === "state" || draft.level === "local" ? draft.level : "federal",
      cycle_year: draft.cycle_year,
      primary_date: draft.primary_date,
      general_election_date: draft.general_election_date,
      term_length_years: draft.term_length_years > 0 ? draft.term_length_years : 2,
      senate_class: draft.senate_class,
      status: "active",
    });
    if (error) {
      if (error.code === "23505") continue;
      if (isMissingSchema(error)) return rolled;
      throw new Error(error.message);
    }
    rolled += 1;
  }
  return rolled;
}

/** Freeze concluded primaries, open the next cycle, and report its filing clock. */
export async function loadNextFilingClock(now = Date.now()) {
  await freezeDuePrimaries();
  const primaries = await loadPrimaries(platformAdmin());
  return nextFilingClock(primaries, now);
}
