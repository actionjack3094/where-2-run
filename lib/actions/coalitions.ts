"use server";

import { revalidatePath } from "next/cache";
import {
  acceptCoalitionInvite,
  createCoalition as createCoalitionRecord,
} from "@/app/actions/coalitions";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { parseElo } from "@/lib/arena/elo";
import {
  COALITION_CHARTER_MAX,
  COALITION_CHARTER_MIN,
  COALITION_NAME_MAX,
  isMissingRelation,
} from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";

/**
 * Profile-facing coalition actions. They return `{ ok: false, error }` with a
 * sentence the UI can show as-is instead of throwing, and they share the
 * coalition tables, RLS model and row logic with app/actions/coalitions.ts.
 *
 * Coalitions are invite-only: a seated member invites a candidate (a `pending`
 * coalition_members row) and the candidate accepts. `joinCoalition` is that
 * acceptance. There is no way to join uninvited.
 */

export type CoalitionActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type CoalitionAffiliation = {
  coalitionId: string;
  name: string;
  charter: string;
  role: "founder" | "member";
  /** Seated (active) members, including the founder. */
  memberCount: number;
};

export type CoalitionInvite = {
  coalitionId: string;
  name: string;
  charter: string;
  memberCount: number;
};

export type RivalCandidate = {
  id: string;
  username: string;
  eloRating: number;
  /** The signed-in user endorses this candidate. */
  endorsedByMe: boolean;
  /** This candidate endorses the signed-in user. */
  endorsesMe: boolean;
};

export type RaceEndorsementDesk = {
  electionId: string;
  officeName: string;
  slug: string | null;
  rivals: RivalCandidate[];
};

export type CoalitionDesk = {
  userId: string;
  affiliations: CoalitionAffiliation[];
  invites: CoalitionInvite[];
  races: RaceEndorsementDesk[];
};

const RIVALS_PER_RACE = 25;

function fail(caught: unknown, what: string, message: string): { ok: false; error: string } {
  console.error(`${what} failed.`, caught);
  return { ok: false, error: message };
}

/**
 * Charter a coalition and seat the founder as its first active member.
 * `description` is stored as the coalition's charter statement.
 */
export async function createCoalition(
  name: string,
  description: string,
  accessToken?: string | null,
): Promise<CoalitionActionResult<{ coalitionId: string }>> {
  const trimmedName = name.trim().replace(/\s+/g, " ");
  const charter = description.trim();

  if (trimmedName.length < 2 || trimmedName.length > COALITION_NAME_MAX) {
    return { ok: false, error: `Name must be between 2 and ${COALITION_NAME_MAX} characters.` };
  }
  if (charter.length < COALITION_CHARTER_MIN || charter.length > COALITION_CHARTER_MAX) {
    return {
      ok: false,
      error: `Description must be between ${COALITION_CHARTER_MIN} and ${COALITION_CHARTER_MAX} characters.`,
    };
  }

  try {
    const created = await createCoalitionRecord(trimmedName, charter, accessToken);
    revalidatePath("/profile");
    return { ok: true, coalitionId: created.coalitionId };
  } catch (caught) {
    return fail(caught, "createCoalition", "We couldn't form that coalition. Please try again.");
  }
}

/** Accept the signed-in user's pending invite to a coalition. */
export async function joinCoalition(
  coalitionId: string,
  accessToken?: string | null,
): Promise<CoalitionActionResult> {
  const id = coalitionId.trim();
  if (!isUuid(id)) return { ok: false, error: "Choose a coalition to join." };

  try {
    const userId = await requireActionUserId(accessToken);
    if (!userId) return { ok: false, error: "Sign in to join a coalition." };

    const admin = createAdminClient();
    const { data: seat, error } = await admin
      .from("coalition_members")
      .select("status")
      .eq("coalition_id", id)
      .eq("candidate_id", userId)
      .maybeSingle();
    if (error) throw error;

    if (!seat) {
      return {
        ok: false,
        error: "Coalitions are invite-only. Ask a seated member to invite you first.",
      };
    }
    if (seat.status === "active") {
      return { ok: false, error: "You're already a member of this coalition." };
    }

    await acceptCoalitionInvite(id, accessToken);
    revalidatePath("/profile");
    return { ok: true };
  } catch (caught) {
    return fail(caught, "joinCoalition", "We couldn't join that coalition. Please try again.");
  }
}

/**
 * Endorse a candidate running in `electionId`. The endorsement ledger is one
 * row per endorser and endorsed pair (not per race), so `electionId` is used to
 * confirm the candidate is actually in that race and is not stored. Endorsing
 * twice is a no-op.
 */
export async function endorseCandidate(
  endorsedCandidateId: string,
  electionId: string,
  accessToken?: string | null,
): Promise<CoalitionActionResult<{ alreadyEndorsed: boolean }>> {
  const endorsedId = endorsedCandidateId.trim();
  const raceId = electionId.trim();
  if (!isUuid(endorsedId) || !isUuid(raceId)) {
    return { ok: false, error: "Choose a candidate and a race to endorse in." };
  }

  try {
    const userId = await requireActionUserId(accessToken);
    if (!userId) return { ok: false, error: "Sign in to endorse a candidate." };
    if (userId === endorsedId) {
      return { ok: false, error: "You can't endorse your own campaign." };
    }

    const admin = createAdminClient();

    const { data: running, error: runningError } = await admin
      .from("campaign_targets")
      .select("id")
      .eq("user_id", endorsedId)
      .eq("election_id", raceId)
      .maybeSingle();
    if (runningError) throw runningError;
    if (!running) {
      return { ok: false, error: "That candidate isn't running in this race." };
    }

    const { data: existing, error: existingError } = await admin
      .from("coalition_endorsements")
      .select("id")
      .eq("endorser_id", userId)
      .eq("endorsed_id", endorsedId)
      .maybeSingle();
    if (existingError) {
      if (isMissingRelation(existingError)) {
        return { ok: false, error: "Endorsements aren't available yet." };
      }
      throw existingError;
    }

    if (!existing) {
      const { error } = await admin
        .from("coalition_endorsements")
        .upsert(
          { endorser_id: userId, endorsed_id: endorsedId },
          { onConflict: "endorser_id,endorsed_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    }

    revalidateEndorsementPaths(userId, endorsedId);
    return { ok: true, alreadyEndorsed: Boolean(existing) };
  } catch (caught) {
    return fail(caught, "endorseCandidate", "We couldn't save that endorsement. Please try again.");
  }
}

/** Take back an endorsement. Withdrawing one that doesn't exist is a no-op. */
export async function withdrawEndorsement(
  endorsedCandidateId: string,
  accessToken?: string | null,
): Promise<CoalitionActionResult> {
  const endorsedId = endorsedCandidateId.trim();
  if (!isUuid(endorsedId)) return { ok: false, error: "Choose a candidate." };

  try {
    const userId = await requireActionUserId(accessToken);
    if (!userId) return { ok: false, error: "Sign in to manage endorsements." };

    const { error } = await createAdminClient()
      .from("coalition_endorsements")
      .delete()
      .eq("endorser_id", userId)
      .eq("endorsed_id", endorsedId);
    if (error) throw error;

    revalidateEndorsementPaths(userId, endorsedId);
    return { ok: true };
  } catch (caught) {
    return fail(caught, "withdrawEndorsement", "We couldn't withdraw that endorsement. Please try again.");
  }
}

function revalidateEndorsementPaths(endorserId: string, endorsedId: string) {
  revalidatePath("/profile");
  revalidatePath(`/profile/${endorserId}`);
  revalidatePath(`/profile/${endorsedId}`);
  revalidatePath(`/candidate/${endorserId}`);
  revalidatePath(`/candidate/${endorsedId}`);
}

/**
 * Everything the profile's coalition desk needs for the signed-in user: seated
 * coalitions with member counts, open invites, and, for each race they target,
 * the other candidates running in it with endorsement state. Read on the server
 * because campaign_targets is readable only by its owner.
 */
export async function loadCoalitionDesk(
  accessToken?: string | null,
): Promise<CoalitionActionResult<{ desk: CoalitionDesk }>> {
  try {
    const userId = await requireActionUserId(accessToken);
    if (!userId) return { ok: false, error: "Sign in to see your coalition." };

    const admin = createAdminClient();

    const [seatsResult, targetsResult] = await Promise.all([
      admin.from("coalition_members").select("coalition_id, status").eq("candidate_id", userId),
      admin.from("campaign_targets").select("election_id").eq("user_id", userId),
    ]);
    if (seatsResult.error && !isMissingRelation(seatsResult.error)) throw seatsResult.error;
    if (targetsResult.error) throw targetsResult.error;

    const seats = (seatsResult.data ?? []) as { coalition_id: string; status: string }[];
    const coalitionIds = [...new Set(seats.map((seat) => seat.coalition_id))];
    const electionIds = [
      ...new Set(((targetsResult.data ?? []) as { election_id: string }[]).map((row) => row.election_id)),
    ];

    const [coalitions, memberRows, elections, rivalTargets] = await Promise.all([
      coalitionIds.length > 0
        ? admin
            .from("coalitions")
            .select("id, name, charter_statement, founder_id")
            .in("id", coalitionIds)
        : Promise.resolve({ data: [], error: null }),
      coalitionIds.length > 0
        ? admin
            .from("coalition_members")
            .select("coalition_id")
            .in("coalition_id", coalitionIds)
            .eq("status", "active")
        : Promise.resolve({ data: [], error: null }),
      electionIds.length > 0
        ? admin.from("elections").select("id, office_name, slug").in("id", electionIds)
        : Promise.resolve({ data: [], error: null }),
      electionIds.length > 0
        ? admin
            .from("campaign_targets")
            .select("user_id, election_id")
            .in("election_id", electionIds)
            .neq("user_id", userId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [coalitions, memberRows, elections, rivalTargets]) {
      if (result.error) throw result.error;
    }

    const memberCount = new Map<string, number>();
    for (const row of (memberRows.data ?? []) as { coalition_id: string }[]) {
      memberCount.set(row.coalition_id, (memberCount.get(row.coalition_id) ?? 0) + 1);
    }

    const statusByCoalition = new Map(seats.map((seat) => [seat.coalition_id, seat.status]));
    const affiliations: CoalitionAffiliation[] = [];
    const invites: CoalitionInvite[] = [];
    for (const row of (coalitions.data ?? []) as {
      id: string;
      name: string;
      charter_statement: string;
      founder_id: string;
    }[]) {
      const base = {
        coalitionId: row.id,
        name: row.name,
        charter: row.charter_statement,
        memberCount: memberCount.get(row.id) ?? 0,
      };
      if (statusByCoalition.get(row.id) === "active") {
        affiliations.push({ ...base, role: row.founder_id === userId ? "founder" : "member" });
      } else {
        invites.push(base);
      }
    }

    const rivalsByElection = new Map<string, Set<string>>();
    for (const row of (rivalTargets.data ?? []) as { user_id: string; election_id: string }[]) {
      const set = rivalsByElection.get(row.election_id) ?? new Set<string>();
      set.add(row.user_id);
      rivalsByElection.set(row.election_id, set);
    }
    const rivalIds = [...new Set([...rivalsByElection.values()].flatMap((set) => [...set]))];

    let people = new Map<string, { username: string | null; elo_rating: number | null }>();
    let endorsedByMe = new Set<string>();
    let endorsesMe = new Set<string>();
    if (rivalIds.length > 0) {
      const [users, outgoing, incoming] = await Promise.all([
        admin.from("users").select("id, username, elo_rating").in("id", rivalIds),
        admin
          .from("coalition_endorsements")
          .select("endorsed_id")
          .eq("endorser_id", userId)
          .in("endorsed_id", rivalIds),
        admin
          .from("coalition_endorsements")
          .select("endorser_id")
          .eq("endorsed_id", userId)
          .in("endorser_id", rivalIds),
      ]);
      if (users.error) throw users.error;
      if (outgoing.error && !isMissingRelation(outgoing.error)) throw outgoing.error;
      if (incoming.error && !isMissingRelation(incoming.error)) throw incoming.error;

      people = new Map(
        ((users.data ?? []) as { id: string; username: string | null; elo_rating: number | null }[]).map(
          (row) => [row.id, row],
        ),
      );
      endorsedByMe = new Set(((outgoing.data ?? []) as { endorsed_id: string }[]).map((row) => row.endorsed_id));
      endorsesMe = new Set(((incoming.data ?? []) as { endorser_id: string }[]).map((row) => row.endorser_id));
    }

    const races: RaceEndorsementDesk[] = ((elections.data ?? []) as {
      id: string;
      office_name: string | null;
      slug: string | null;
    }[])
      .map((election) => ({
        electionId: election.id,
        officeName: election.office_name?.trim() || "Open race",
        slug: election.slug ?? null,
        rivals: [...(rivalsByElection.get(election.id) ?? [])]
          .map((id) => ({
            id,
            username: people.get(id)?.username?.trim() || `Candidate ${id.slice(0, 6)}`,
            eloRating: parseElo(people.get(id)?.elo_rating),
            endorsedByMe: endorsedByMe.has(id),
            endorsesMe: endorsesMe.has(id),
          }))
          .sort((a, b) => b.eloRating - a.eloRating || a.username.localeCompare(b.username))
          .slice(0, RIVALS_PER_RACE),
      }))
      .sort((a, b) => a.officeName.localeCompare(b.officeName));

    return { ok: true, desk: { userId, affiliations, invites, races } };
  } catch (caught) {
    return fail(caught, "loadCoalitionDesk", "We couldn't load your coalition.");
  }
}
