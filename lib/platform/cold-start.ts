import { judgeArenaExchange } from "@/lib/ai/judge";
import { ensureSparringRoster, SPARRING_PERSONAS } from "@/lib/ai/bots";
import { releaseExpiredSeats } from "@/lib/actions/debates";
import {
  ARENA_PUBLIC_COLUMNS,
  loadPrimaries,
  platformAdmin,
  type ArenaPublic,
} from "@/lib/platform/records";

const DAY_MS = 24 * 60 * 60 * 1000;

function closestPersona(party: string, x: number, y: number) {
  const pool = SPARRING_PERSONAS.filter((persona) => persona.party === party);
  return pool.sort(
    (a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2),
  )[0];
}

export async function ensureColdStart() {
  const admin = platformAdmin();
  const ids = await ensureSparringRoster(admin);

  const primaries = await loadPrimaries(admin);
  for (const primary of primaries) {
    const { count, error } = await admin
      .from("arena_debates")
      .select("id", { count: "exact", head: true })
      .eq("primary_id", primary.id)
      .eq("status", "open_challenge");
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0) continue;
    const persona = closestPersona(primary.party, primary.baseline_x, primary.baseline_y);
    const authorId = ids.get(persona.key);
    if (!authorId) continue;
    const { data: prompt, error: promptError } = await admin
      .from("debate_prompts")
      .insert({
        primary_id: primary.id,
        author_id: authorId,
        author_kind: "ai",
        prompt_text: `What should the ${primary.party === "democrat" ? "Democratic" : "Republican"} nominee for ${primary.office_name} promise first?`,
        stance_text: persona.stance,
        ideology_x: persona.x,
        ideology_y: persona.y,
        status: "open",
      })
      .select("id")
      .single();
    if (promptError) throw new Error(promptError.message);
    const { error: debateError } = await admin.from("arena_debates").insert({
      primary_id: primary.id,
      prompt_id: prompt.id,
      candidate_a_id: authorId,
      stance_a: persona.stance,
      status: "open_challenge",
    });
    if (debateError) throw new Error(debateError.message);
  }

  const staleBefore = new Date(Date.now() - DAY_MS).toISOString();
  const { data: stale, error: staleError } = await admin
    .from("arena_debates")
    .select(ARENA_PUBLIC_COLUMNS)
    .eq("status", "open_challenge")
    .is("candidate_b_id", null)
    .lt("created_at", staleBefore);
  if (staleError) throw new Error(staleError.message);

  for (const debate of (stale ?? []) as ArenaPublic[]) {
    const primary = primaries.find((row) => row.id === debate.primary_id);
    if (!primary) continue;
    const challenger = SPARRING_PERSONAS.filter((persona) => persona.party === primary.party).find(
      (persona) => ids.get(persona.key) !== debate.candidate_a_id,
    );
    if (!challenger) continue;
    const challengerId = ids.get(challenger.key);
    if (!challengerId) continue;
    const lock = new Date();
    const { error: claimError } = await admin
      .from("arena_debates")
      .update({
        candidate_b_id: challengerId,
        stance_b: challenger.stance,
        status: "active",
        seat_locked_until: lock.toISOString(),
        updated_at: lock.toISOString(),
      })
      .eq("id", debate.id)
      .eq("status", "open_challenge");
    if (claimError) throw new Error(claimError.message);
    await admin.from("debate_prompts").update({ status: "locked" }).eq("id", debate.prompt_id);
    await judgeArenaExchange(debate.id);
  }

  await releaseExpiredSeats();
}
