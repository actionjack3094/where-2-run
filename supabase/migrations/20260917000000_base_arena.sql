-- Arena tables that later migrations alter. Created here so `supabase db reset`
-- can build a local database from this folder alone.
-- Idempotent: safe if the tables already exist on a hosted project.

create extension if not exists vector;

create table if not exists public.districts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level text not null,
  pvi_score numeric,
  historical_lean text,
  median_ideology_vector vector(10),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint districts_level_check
    check (level in ('local', 'state', 'federal'))
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  ideology_vector vector(10),
  target_district_id uuid references public.districts(id) on delete set null,
  viability_score integer not null default 0,
  tier text,
  is_verified boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.debates (
  id uuid primary key default gen_random_uuid(),
  district_id uuid references public.districts(id) on delete cascade,
  topic text not null,
  candidate_a_id uuid references public.users(id) on delete set null,
  candidate_b_id uuid references public.users(id) on delete set null,
  status text not null default 'matching',
  current_round integer not null default 1,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint debates_status_check
    check (status in ('matching', 'active', 'voting', 'completed', 'expired'))
);

create table if not exists public.arguments (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.debates(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  round_number integer not null,
  content text not null,
  consistency_score integer,
  consistency_critique text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint arguments_consistency_score_check
    check (consistency_score is null or (consistency_score >= 0 and consistency_score <= 100))
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.debates(id) on delete cascade,
  voter_id uuid not null references public.users(id) on delete cascade,
  candidate_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (debate_id, voter_id)
);

alter table public.districts enable row level security;
alter table public.users enable row level security;
alter table public.debates enable row level security;
alter table public.arguments enable row level security;
alter table public.votes enable row level security;

drop policy if exists "Districts are viewable by everyone." on public.districts;
create policy "Districts are viewable by everyone."
  on public.districts for select using (true);

drop policy if exists "Users are viewable by everyone." on public.users;
create policy "Users are viewable by everyone."
  on public.users for select using (true);

drop policy if exists "Users can insert their own profile." on public.users;
create policy "Users can insert their own profile."
  on public.users for insert with check (auth.uid() = id);

drop policy if exists "Users can update their own profile." on public.users;
create policy "Users can update their own profile."
  on public.users for update using (auth.uid() = id);

drop policy if exists "Public read debates" on public.debates;
create policy "Public read debates"
  on public.debates for select using (true);

drop policy if exists "Public read arguments" on public.arguments;
create policy "Public read arguments"
  on public.arguments for select using (true);

drop policy if exists "Public read votes" on public.votes;
create policy "Public read votes"
  on public.votes for select using (true);

grant select on public.districts, public.users, public.debates, public.arguments, public.votes
  to anon, authenticated, service_role;
grant insert, update, delete on public.users to authenticated, service_role;
grant insert, update, delete on public.debates, public.arguments, public.votes
  to service_role;
