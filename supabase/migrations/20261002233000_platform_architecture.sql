-- Platform architecture: ideology profiles, paired primaries, per-primary Elo,
-- and the single-exchange debates arena.
--
-- Arena matches live in public.arena_debates (the debates entity). Legacy
-- public.debates stays on the expiration-cron pipeline.

alter table public.profiles
  add column if not exists ideology_x double precision,
  add column if not exists ideology_y double precision,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists is_verified boolean not null default false,
  add column if not exists legal_name text,
  add column if not exists display_name text,
  add column if not exists candidate_tier text not null default 'pundit',
  add column if not exists is_synthetic boolean not null default false,
  add column if not exists synthetic_key text;

alter table public.profiles drop constraint if exists profiles_ideology_x_range;
alter table public.profiles
  add constraint profiles_ideology_x_range
  check (ideology_x is null or (ideology_x >= -1::double precision and ideology_x <= 1::double precision));

alter table public.profiles drop constraint if exists profiles_ideology_y_range;
alter table public.profiles
  add constraint profiles_ideology_y_range
  check (ideology_y is null or (ideology_y >= -1::double precision and ideology_y <= 1::double precision));

alter table public.profiles drop constraint if exists profiles_candidate_tier_check;
alter table public.profiles
  add constraint profiles_candidate_tier_check
  check (candidate_tier in ('pundit', 'declared_candidate', 'frontrunner'));

create unique index if not exists profiles_synthetic_key_unique
  on public.profiles (synthetic_key)
  where synthetic_key is not null;

create table if not exists public.primaries (
  id uuid primary key default gen_random_uuid(),
  party text not null,
  office_name text not null,
  state text not null,
  district text,
  ocd_id text not null,
  baseline_x double precision not null,
  baseline_y double precision not null,
  slug text not null unique,
  general_slug text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint primaries_party_check check (party in ('democrat', 'republican')),
  constraint primaries_baseline_x_range check (baseline_x >= -1::double precision and baseline_x <= 1::double precision),
  constraint primaries_baseline_y_range check (baseline_y >= -1::double precision and baseline_y <= 1::double precision)
);

create index if not exists primaries_ocd_id_idx on public.primaries (ocd_id);
create index if not exists primaries_party_idx on public.primaries (party);
create index if not exists primaries_general_slug_idx on public.primaries (general_slug);

create table if not exists public.primary_standings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary_id uuid not null references public.primaries (id) on delete cascade,
  elo integer not null default 1200,
  debates_count integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  ties integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint primary_standings_user_primary_key unique (user_id, primary_id),
  constraint primary_standings_elo_check check (elo >= 0),
  constraint primary_standings_counts_check check (
    debates_count >= 0 and wins >= 0 and losses >= 0 and ties >= 0
  )
);

create index if not exists primary_standings_primary_elo_idx
  on public.primary_standings (primary_id, elo desc);

create table if not exists public.debate_prompts (
  id uuid primary key default gen_random_uuid(),
  primary_id uuid not null references public.primaries (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_kind text not null default 'user',
  prompt_text text not null,
  stance_text text not null,
  ideology_x double precision not null,
  ideology_y double precision not null,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint debate_prompts_author_kind_check check (author_kind in ('user', 'ai')),
  constraint debate_prompts_status_check check (status in ('open', 'locked', 'concluded')),
  constraint debate_prompts_ideology_x_range check (ideology_x >= -1::double precision and ideology_x <= 1::double precision),
  constraint debate_prompts_ideology_y_range check (ideology_y >= -1::double precision and ideology_y <= 1::double precision)
);

create index if not exists debate_prompts_primary_status_idx
  on public.debate_prompts (primary_id, status, created_at desc);

-- Debates entity for the arena. Separate from legacy public.debates.
create table if not exists public.arena_debates (
  id uuid primary key default gen_random_uuid(),
  primary_id uuid not null references public.primaries (id) on delete cascade,
  prompt_id uuid not null references public.debate_prompts (id) on delete cascade,
  candidate_a_id uuid not null references public.profiles (id) on delete cascade,
  candidate_b_id uuid references public.profiles (id) on delete set null,
  stance_a text not null,
  stance_b text,
  seat_locked_until timestamptz,
  status text not null default 'open_challenge',
  winner_id uuid references public.profiles (id) on delete set null,
  is_tie boolean not null default false,
  candidate_a_score double precision,
  candidate_b_score double precision,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint arena_debates_status_check check (status in ('open_challenge', 'active', 'concluded')),
  constraint arena_debates_score_a_range check (
    candidate_a_score is null or (candidate_a_score >= 0::double precision and candidate_a_score <= 1::double precision)
  ),
  constraint arena_debates_score_b_range check (
    candidate_b_score is null or (candidate_b_score >= 0::double precision and candidate_b_score <= 1::double precision)
  )
);

create index if not exists arena_debates_primary_status_idx
  on public.arena_debates (primary_id, status, created_at desc);

comment on table public.arena_debates is
  'Debates arena. Single-exchange intra-party matches. candidate_*_score is internal and is not a public column.';

comment on column public.arena_debates.candidate_a_score is
  'Internal adherence score. Never select this for a client response.';
comment on column public.arena_debates.candidate_b_score is
  'Internal adherence score. Never select this for a client response.';

create table if not exists public.debate_comments (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.arena_debates (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint debate_comments_body_check check (char_length(body) between 1 and 400)
);

create index if not exists debate_comments_debate_idx
  on public.debate_comments (debate_id, created_at);

create table if not exists public.debate_likes (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.arena_debates (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  supported_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint debate_likes_one_per_user unique (debate_id, user_id)
);

create index if not exists debate_likes_debate_idx on public.debate_likes (debate_id);

alter table public.primaries enable row level security;
alter table public.primary_standings enable row level security;
alter table public.debate_prompts enable row level security;
alter table public.arena_debates enable row level security;
alter table public.debate_comments enable row level security;
alter table public.debate_likes enable row level security;

drop policy if exists "Public read primaries" on public.primaries;
create policy "Public read primaries" on public.primaries for select using (true);

drop policy if exists "Public read primary standings" on public.primary_standings;
create policy "Public read primary standings" on public.primary_standings for select using (true);

drop policy if exists "Public read debate prompts" on public.debate_prompts;
create policy "Public read debate prompts" on public.debate_prompts for select using (true);

drop policy if exists "Public read arena debates" on public.arena_debates;
create policy "Public read arena debates" on public.arena_debates for select using (true);

drop policy if exists "Public read debate comments" on public.debate_comments;
create policy "Public read debate comments" on public.debate_comments for select using (true);

drop policy if exists "Public read debate likes" on public.debate_likes;
create policy "Public read debate likes" on public.debate_likes for select using (true);

grant select on public.primaries, public.primary_standings, public.debate_prompts,
  public.debate_comments, public.debate_likes
  to anon, authenticated, service_role;

grant select (
  id,
  primary_id,
  prompt_id,
  candidate_a_id,
  candidate_b_id,
  stance_a,
  stance_b,
  seat_locked_until,
  status,
  winner_id,
  is_tie,
  created_at,
  updated_at
) on public.arena_debates to anon, authenticated;

grant select, insert, update, delete on public.arena_debates to service_role;
grant insert, update, delete on public.primaries, public.primary_standings, public.debate_prompts,
  public.debate_comments, public.debate_likes
  to service_role;

revoke select (candidate_a_score, candidate_b_score) on public.arena_debates from public, anon, authenticated;

insert into public.primaries (
  party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug
)
values
  (
    'democrat', 'U.S. Senate', 'TX', null,
    'ocd-division/country:us/state:tx',
    -0.55, -0.35, 'tx-senate-dem', 'tx-senate'
  ),
  (
    'republican', 'U.S. Senate', 'TX', null,
    'ocd-division/country:us/state:tx',
    0.62, 0.48, 'tx-senate-rep', 'tx-senate'
  ),
  (
    'democrat', 'U.S. House', 'TX', '10',
    'ocd-division/country:us/state:tx/cd:10',
    -0.42, -0.22, 'tx-10-dem', 'tx-10'
  ),
  (
    'republican', 'U.S. House', 'TX', '10',
    'ocd-division/country:us/state:tx/cd:10',
    0.48, 0.36, 'tx-10-rep', 'tx-10'
  )
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
