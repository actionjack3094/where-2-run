/**
 * Austin / Texas cold-start demo.
 *
 * Three races (US House TX-37, Texas Senate SD-14, Austin Mayor), six
 * Democratic candidates with bios, ideology coordinates, civic standing, and
 * pledged war chests, plus Soapbox speeches and arena debates.
 *
 *   npm run seed:austin
 *
 * Reads .env.local. Requires NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. Apply supabase/migrations/20261005150000_demo_surfaces.sql
 * first. Re-running updates the same rows.
 */

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createAdminClient } from "@/lib/db/supabase-admin";

const CYCLE = 2026;

const RACES = [
  {
    key: "tx37",
    office: "U.S. House",
    district: "37",
    level: "federal",
    term: 2,
    ocd: "ocd-division/country:us/state:tx/cd:37",
    general: "tx-37",
    dem: {
      id: "c37a0001-0037-4000-8000-0000000000d1",
      slug: "tx-37-dem",
      x: -0.46,
      y: -0.24,
    },
    rep: {
      id: "c37a0001-0037-4000-8000-0000000000e1",
      slug: "tx-37-rep",
      x: 0.42,
      y: 0.3,
    },
  },
  {
    key: "sd14",
    office: "Texas State Senate",
    district: "14",
    level: "state",
    term: 4,
    ocd: "ocd-division/country:us/state:tx/sldu:14",
    general: "tx-sd-14",
    dem: {
      id: "c37a0001-0014-4000-8000-0000000000d2",
      slug: "tx-sd-14-dem",
      x: -0.4,
      y: -0.12,
    },
    rep: {
      id: "c37a0001-0014-4000-8000-0000000000e2",
      slug: "tx-sd-14-rep",
      x: 0.38,
      y: 0.22,
    },
  },
  {
    key: "mayor",
    office: "Austin Mayor",
    district: null as string | null,
    level: "local",
    term: 4,
    ocd: "ocd-division/country:us/state:tx/place:austin",
    general: "austin-mayor",
    dem: {
      id: "c37a0001-0005-4000-8000-0000000000d3",
      slug: "austin-mayor-dem",
      x: -0.42,
      y: -0.18,
    },
    rep: {
      id: "c37a0001-0005-4000-8000-0000000000e3",
      slug: "austin-mayor-rep",
      x: 0.28,
      y: 0.16,
    },
  },
] as const;

type Candidate = {
  id: string;
  slug: string;
  name: string;
  race: (typeof RACES)[number]["key"];
  x: number;
  y: number;
  civic: number;
  debates: number;
  logged: number;
  ties: number;
  consistency: number;
  chest: number;
  bio: string;
  manifesto: string;
  policies: string[];
};

const CANDIDATES: Candidate[] = [
  {
    id: "e1a00001-0001-4000-8000-000000000001",
    slug: "elena-morales",
    name: "Elena Morales",
    race: "tx37",
    x: -0.58,
    y: -0.32,
    civic: 1624,
    debates: 4,
    logged: 4,
    ties: 0,
    consistency: 96,
    chest: 28400,
    bio: "Former Austin planning commissioner and housing attorney. Elena represents TX-37 and argues the district can add homes along transit without giving up Barton Springs or neighborhood plans.",
    manifesto:
      "TX-37 should build more homes where the trains and frequent buses already run, keep floodplains open, and use a public land bank so teachers can live in the district they serve.",
    policies: ["Fourplexes on transit streets", "City land bank for educators", "Floodplain setbacks stay in place"],
  },
  {
    id: "e1a00001-0002-4000-8000-000000000002",
    slug: "david-chen",
    name: "David Chen",
    race: "tx37",
    x: -0.31,
    y: -0.6,
    civic: 1412,
    debates: 3,
    logged: 3,
    ties: 1,
    consistency: 91,
    chest: 12600,
    bio: "Transit organizer from North Loop. David wants Congress to lock in right-of-way for Project Connect and fund buses that actually show up on Lamar.",
    manifesto:
      "A federal transit seat should buy frequency, not another study. Dedicate the rail right-of-way and run buses every eight minutes on the corridors people already ride.",
    policies: ["Project Connect right-of-way", "Eight-minute Lamar bus", "Youth transit passes"],
  },
  {
    id: "e1a00001-0003-4000-8000-000000000003",
    slug: "priya-shah",
    name: "Priya Shah",
    race: "sd14",
    x: -0.5,
    y: -0.1,
    civic: 1708,
    debates: 5,
    logged: 5,
    ties: 1,
    consistency: 98,
    chest: 34200,
    bio: "Energy lawyer who clerked at the PUC. Priya is running for Senate District 14 to pair Austin rooftop solar with a municipal battery so summer peaks stop tripping the grid.",
    manifesto:
      "ERCOT should stop asking Austin to conserve while gas plants sit idle. Rooftop solar plus storage at the old Decker site covers the peak without a new fossil permit.",
    policies: ["Decker site battery", "Rooftop solar standard", "No new peaker plants"],
  },
  {
    id: "e1a00001-0004-4000-8000-000000000004",
    slug: "marcus-hale",
    name: "Marcus Hale",
    race: "sd14",
    x: -0.18,
    y: 0.2,
    civic: 1288,
    debates: 2,
    logged: 2,
    ties: 0,
    consistency: 88,
    chest: 8900,
    bio: "High-school government teacher in East Austin. Marcus wants the state surplus aimed at the AISD pay gap before another testing contract.",
    manifesto:
      "Senate District 14 should close the teacher pay gap with Round Rock, cap early-grade classes at 22, and stop buying testing vendors the classrooms did not ask for.",
    policies: ["Close the AISD pay gap", "Class size cap of 22", "Pause new testing contracts"],
  },
  {
    id: "e1a00001-0005-4000-8000-000000000005",
    slug: "camila-ortiz",
    name: "Camila Ortiz",
    race: "mayor",
    x: -0.7,
    y: -0.4,
    civic: 1555,
    debates: 3,
    logged: 3,
    ties: 0,
    consistency: 94,
    chest: 21750,
    bio: "Neighborhood organizer from Dove Springs, running for mayor. Camila wants apartments on city-owned lots along MetroRail, with one in five homes at a price teachers can pay.",
    manifesto:
      "A teacher should be able to rent in the city they serve. Fast-track apartments on city land beside MetroRail and require one in five units within reach of a public-school salary.",
    policies: ["City lots beside MetroRail", "One-in-five affordable units", "Permit shot clock of 90 days"],
  },
  {
    id: "e1a00001-0006-4000-8000-000000000006",
    slug: "jordan-ellis",
    name: "Jordan Ellis",
    race: "mayor",
    x: -0.34,
    y: -0.16,
    civic: 1364,
    debates: 2,
    logged: 2,
    ties: 0,
    consistency: 90,
    chest: 15300,
    bio: "Former CapMetro planner. Jordan's mayoral bid starts with a frequent bus on William Cannon and free youth passes so a magnet school does not require a car.",
    manifesto:
      "Austin moves when the bus is frequent and the ride to school is free. William Cannon service and youth passes come before another downtown garage.",
    policies: ["Frequent William Cannon bus", "Free youth transit", "Hold new downtown garages"],
  },
];

const AVERY = {
  id: "e1a00001-0007-4000-8000-000000000007",
  slug: "avery-nguyen",
  name: "Avery Nguyen",
};

const POSTS = [
  {
    id: "50a90001-0001-4000-8000-000000000001",
    author: "elena-morales",
    tags: ["Housing"],
    upvotes: 42,
    content:
      "Austin can add homes without paving Barton Springs. Fourplexes on transit streets, and a land bank so teachers can live in the district they serve.",
  },
  {
    id: "50a90001-0002-4000-8000-000000000002",
    author: "david-chen",
    tags: ["Transit"],
    upvotes: 27,
    content:
      "Project Connect stalls when every mile is a lawsuit. Dedicate the right-of-way and run a bus every 8 minutes on Lamar.",
  },
  {
    id: "50a90001-0003-4000-8000-000000000003",
    author: "priya-shah",
    tags: ["Clean Energy"],
    upvotes: 36,
    content:
      "ERCOT keeps asking Austin to conserve while gas plants sit idle. Pair rooftop solar with a battery at the old Decker site.",
  },
  {
    id: "50a90001-0004-4000-8000-000000000004",
    author: "marcus-hale",
    tags: ["Education"],
    upvotes: 19,
    content:
      "AISD is losing teachers to Round Rock over an $8,000 pay gap. Fund the gap from the surplus and cap K-3 classes at 22.",
  },
  {
    id: "50a90001-0005-4000-8000-000000000005",
    author: "camila-ortiz",
    tags: ["Housing"],
    upvotes: 51,
    content:
      "A teacher should be able to rent in the city they serve. Fast-track apartments on city lots along MetroRail, one in five at a working wage.",
  },
  {
    id: "50a90001-0006-4000-8000-000000000006",
    author: "jordan-ellis",
    tags: ["Transit", "Education"],
    upvotes: 23,
    content:
      "Kids in Dove Springs should not need a car to reach a magnet school. Free youth passes and a frequent bus on William Cannon come first.",
  },
  {
    id: "50a90001-0007-4000-8000-000000000007",
    author: "elena-morales",
    tags: ["Housing", "Transit"],
    upvotes: 18,
    content:
      "If the Orange Line stops, the homes should already be legal next to the station. Zoning and the rail vote are the same fight.",
  },
  {
    id: "50a90001-0008-4000-8000-000000000008",
    author: "priya-shah",
    tags: ["Clean Energy", "Housing"],
    upvotes: 14,
    content:
      "New apartments should come with solar-ready roofs and a plug for the bus depot next door. The grid and the housing crisis are one bill.",
  },
];

const DEBATES = [
  {
    id: "d3b70002-0001-4000-8000-000000000001",
    promptId: "d3b70002-0011-4000-8000-000000000001",
    race: "tx37" as const,
    status: "concluded" as const,
    a: "elena-morales",
    b: "david-chen",
    winner: "elena-morales",
    tie: false,
    prompt: "Should TX-37 trade neighborhood zoning vetoes for housing beside Project Connect stations?",
    stanceA:
      "Yes. The stations only work if people can live beside them. Keep the floodplain rules, and let fourplexes rise on the transit streets the city has already drawn.",
    stanceB:
      "The rail has to be real before we upzone the blocks around a line that is still in court. Frequency on Lamar moves more people this year than a zoning rewrite.",
  },
  {
    id: "d3b70002-0002-4000-8000-000000000002",
    promptId: "d3b70002-0012-4000-8000-000000000002",
    race: "sd14" as const,
    status: "concluded" as const,
    a: "priya-shah",
    b: "marcus-hale",
    winner: "priya-shah",
    tie: false,
    prompt: "Should Senate District 14 spend the surplus on grid storage or on closing the teacher pay gap?",
    stanceA:
      "Storage at Decker keeps the lights on for every classroom. A battery pays for itself the first August the peak does not black out East Austin.",
    stanceB:
      "Teachers are leaving for an $8,000 gap. A battery does not grade papers. Put the surplus in the classroom before we buy another plant.",
  },
  {
    id: "d3b70002-0003-4000-8000-000000000003",
    promptId: "d3b70002-0013-4000-8000-000000000003",
    race: "mayor" as const,
    status: "active" as const,
    a: "camila-ortiz",
    b: "jordan-ellis",
    winner: null,
    tie: false,
    prompt: "What should Austin build first: apartments on city land, or frequent buses to the schools?",
    stanceA:
      "Homes. City lots beside MetroRail can hold the apartments teachers can afford. A bus to a school still needs a lease at the end of the ride.",
    stanceB:
      "The bus. Dove Springs already has the families. A frequent William Cannon line and a free youth pass put those kids in class this semester.",
  },
];

function loadEnv() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) loadDotenv({ path, override: false });
  }
}

function isMissingUser(error: { message?: string; status?: number; code?: string } | null | undefined) {
  if (!error) return false;
  return error.status === 404 || error.code === "user_not_found" || /not found/i.test(error.message ?? "");
}

function isDuplicate(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "23505" || /already been registered|already exists|duplicate key/i.test(error.message ?? "");
}

type Admin = ReturnType<typeof createAdminClient>;

async function ensureAuthUser(admin: Admin, id: string, email: string, name: string) {
  const existing = await admin.auth.admin.getUserById(id);
  if (existing.data.user) return existing.data.user.id;
  if (existing.error && !isMissingUser(existing.error)) {
    throw new Error(existing.error.message);
  }
  const created = await admin.auth.admin.createUser({
    id,
    email,
    password: process.env.SEED_BOT_PASSWORD ?? "seed-bot-local-only",
    email_confirm: true,
    user_metadata: { full_name: name, synthetic: true },
  });
  if (!created.error && created.data.user) return created.data.user.id;
  if (created.error && isDuplicate(created.error)) {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = listed.data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
  }
  throw new Error(created.error?.message ?? `Could not create ${name}.`);
}

type PrimarySide = { id: string; slug: string; x: number; y: number };

async function ensurePrimary(
  admin: Admin,
  race: (typeof RACES)[number],
  side: PrimarySide,
  party: "democrat" | "republican",
) {
  const found = await admin
    .from("primaries")
    .select("id")
    .eq("slug", side.slug)
    .eq("cycle_year", CYCLE)
    .maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (found.data?.id) {
    const updated = await admin
      .from("primaries")
      .update({
        party,
        office_name: race.office,
        state: "TX",
        district: race.district,
        ocd_id: race.ocd,
        baseline_x: side.x,
        baseline_y: side.y,
        general_slug: race.general,
        level: race.level,
        term_length_years: race.term,
        status: "active",
      })
      .eq("id", found.data.id);
    if (updated.error) throw new Error(updated.error.message);
    return found.data.id;
  }

  const inserted = await admin
    .from("primaries")
    .insert({
      id: side.id,
      party,
      office_name: race.office,
      state: "TX",
      district: race.district,
      ocd_id: race.ocd,
      baseline_x: side.x,
      baseline_y: side.y,
      slug: side.slug,
      general_slug: race.general,
      level: race.level,
      cycle_year: CYCLE,
      primary_date: "2026-03-03T20:00:00Z",
      general_election_date: "2026-11-03T00:00:00Z",
      term_length_years: race.term,
      senate_class: null,
      status: "active",
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(`${side.slug}: ${inserted.error.message}`);
  return inserted.data.id;
}

async function main() {
  loadEnv();
  const admin = createAdminClient();
  const primaryIds = new Map<string, string>();

  for (const race of RACES) {
    const demId = await ensurePrimary(admin, race, race.dem, "democrat");
    await ensurePrimary(admin, race, race.rep, "republican");
    primaryIds.set(race.key, demId);
    console.log(`[Austin] ${race.office} ${race.district ?? ""} · ${demId}`);
  }

  const userIds = new Map<string, string>();
  for (const candidate of CANDIDATES) {
    const email = `${candidate.slug}@seed.where2run.local`;
    const userId = await ensureAuthUser(admin, candidate.id, email, candidate.name);
    userIds.set(candidate.slug, userId);
    const profile = await admin
      .from("profiles")
      .update({
        email,
        full_name: candidate.name,
        display_name: candidate.name,
        legal_name: candidate.name,
        bio: candidate.bio,
        ideology_x: candidate.x,
        ideology_y: candidate.y,
        onboarding_completed: true,
        is_verified: true,
        candidate_tier: "declared_candidate",
        is_synthetic: false,
        synthetic_key: `austin-${candidate.slug}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (profile.error) throw new Error(`${candidate.name}: ${profile.error.message}`);

    const primaryId = primaryIds.get(candidate.race);
    if (!primaryId) throw new Error(`Missing primary for ${candidate.race}.`);

    const standing = await admin.from("primary_standings").upsert(
      {
        user_id: userId,
        primary_id: primaryId,
        civic_standing: candidate.civic,
        debates_count: candidate.debates,
        debates_logged: candidate.logged,
        ties: candidate.ties,
        policy_consistency: candidate.consistency,
        pledged_war_chest: candidate.chest,
        is_nominee: false,
      },
      { onConflict: "user_id,primary_id" },
    );
    if (standing.error) throw new Error(`${candidate.name} standing: ${standing.error.message}`);

    const platform = await admin.from("candidate_platforms").upsert(
      {
        user_id: userId,
        primary_id: primaryId,
        manifesto: candidate.manifesto,
        key_policies: candidate.policies,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,primary_id" },
    );
    if (platform.error) throw new Error(`${candidate.name} platform: ${platform.error.message}`);
    console.log(
      `[Austin] ${candidate.name} · civic ${candidate.civic} · chest $${candidate.chest.toLocaleString("en-US")}`,
    );
  }

  const averyId = await ensureAuthUser(
    admin,
    AVERY.id,
    `${AVERY.slug}@seed.where2run.local`,
    AVERY.name,
  );
  const averyProfile = await admin
    .from("profiles")
    .update({
      full_name: AVERY.name,
      display_name: AVERY.name,
      ideology_x: -0.4,
      ideology_y: -0.2,
      onboarding_completed: true,
      is_verified: true,
      is_synthetic: false,
      synthetic_key: `austin-${AVERY.slug}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", averyId);
  if (averyProfile.error) throw new Error(averyProfile.error.message);

  for (const post of POSTS) {
    const authorId = userIds.get(post.author);
    if (!authorId) throw new Error(`Missing author ${post.author}.`);
    const saved = await admin.from("soapbox_posts").upsert(
      {
        id: post.id,
        author_id: authorId,
        content: post.content,
        tags: [...post.tags],
        upvote_count: post.upvotes,
      },
      { onConflict: "id" },
    );
    if (saved.error) throw new Error(`Soapbox ${post.id}: ${saved.error.message}`);
  }
  console.log(`[Austin] ${POSTS.length} Soapbox speeches.`);

  const lockUntil = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
  for (const debate of DEBATES) {
    const primaryId = primaryIds.get(debate.race);
    const candidateA = userIds.get(debate.a);
    const candidateB = userIds.get(debate.b);
    const opener = CANDIDATES.find((candidate) => candidate.slug === debate.a);
    if (!primaryId || !candidateA || !candidateB || !opener) {
      throw new Error(`Debate ${debate.id} is missing a seat.`);
    }
    const prompt = await admin.from("debate_prompts").upsert(
      {
        id: debate.promptId,
        primary_id: primaryId,
        author_id: candidateA,
        author_kind: "user",
        prompt_text: debate.prompt,
        stance_text: debate.stanceA,
        ideology_x: opener.x,
        ideology_y: opener.y,
        status: debate.status === "concluded" ? "concluded" : "locked",
      },
      { onConflict: "id" },
    );
    if (prompt.error) throw new Error(`Prompt ${debate.promptId}: ${prompt.error.message}`);

    const row = await admin.from("arena_debates").upsert(
      {
        id: debate.id,
        primary_id: primaryId,
        prompt_id: debate.promptId,
        candidate_a_id: candidateA,
        candidate_b_id: candidateB,
        stance_a: debate.stanceA,
        stance_b: debate.stanceB,
        status: debate.status,
        winner_id: debate.winner ? userIds.get(debate.winner) ?? null : null,
        is_tie: debate.tie,
        seat_locked_until: debate.status === "active" ? lockUntil : null,
      },
      { onConflict: "id" },
    );
    if (row.error) throw new Error(`Debate ${debate.id}: ${row.error.message}`);

    const link = await admin.from("arena_debate_primaries").upsert(
      { debate_id: debate.id, primary_id: primaryId },
      { onConflict: "debate_id,primary_id" },
    );
    if (link.error) throw new Error(`Debate primaries ${debate.id}: ${link.error.message}`);
    console.log(`[Austin] debate ${debate.status} · ${debate.prompt}`);
  }

  const enlistments = [
    { campaign: "elena-morales", race: "tx37" },
    { campaign: "priya-shah", race: "sd14" },
    { campaign: "camila-ortiz", race: "mayor" },
  ];
  for (const row of enlistments) {
    const campaignId = userIds.get(row.campaign);
    const primaryId = primaryIds.get(row.race);
    if (!campaignId || !primaryId) continue;
    const saved = await admin.from("volunteer_signups").upsert(
      {
        campaign_user_id: campaignId,
        volunteer_user_id: averyId,
        primary_id: primaryId,
        status: "enlisted",
      },
      { onConflict: "campaign_user_id,volunteer_user_id,primary_id" },
    );
    if (saved.error) throw new Error(`Volunteer ${row.campaign}: ${saved.error.message}`);
  }

  console.log("[Austin] Seeded 3 races, 6 candidates, Soapbox speeches, and 3 arena debates.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Seed failed.";
  console.error(message);
  process.exitCode = 1;
});
