-- Phase 2: four-round debates, District Gauntlet, institutional backing, Civic Credit.

alter table public.arena_debates
  add column if not exists exchange_round smallint not null default 1,
  add column if not exists round_transcript jsonb not null default '[]'::jsonb;

comment on column public.arena_debates.exchange_round is
  'Last completed round. 1 Opening Statement, 2 Rebuttal 1, 3 Rebuttal 2, 4 Closing Statement.';

alter table public.primary_standings
  add column if not exists institutional_war_chest numeric not null default 0;

alter table public.soapbox_posts
  add column if not exists locked boolean not null default false;

comment on column public.soapbox_posts.locked is
  'Transparency posts published when a candidate accepts an institutional pledge. They cannot be deleted.';

create or replace function public.block_locked_soapbox_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.locked then
    raise exception 'Transparency posts stay on the Soapbox.';
  end if;
  if tg_op = 'UPDATE' and old.locked and new.content is distinct from old.content then
    raise exception 'Transparency posts stay on the Soapbox.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists soapbox_posts_block_locked_change on public.soapbox_posts;
create trigger soapbox_posts_block_locked_change
  before update or delete on public.soapbox_posts
  for each row execute function public.block_locked_soapbox_change();

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('pac', 'union')),
  summary text not null default '',
  steward_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

comment on table public.entities is
  'View-only PAC and union profiles. They endorse and file prompts. They do not debate.';

create table if not exists public.institutional_pledges (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  primary_id uuid references public.primaries (id) on delete set null,
  amount numeric not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists institutional_pledges_candidate_idx
  on public.institutional_pledges (candidate_id, status);

create table if not exists public.entity_endorsements (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  primary_id uuid references public.primaries (id) on delete set null,
  statement text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.platform_pledges (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  primary_id uuid references public.primaries (id) on delete set null,
  amount numeric not null check (amount > 0),
  source text not null check (source in ('grassroots', 'institutional')),
  status text not null default 'pledged' check (status in ('pledged', 'accepted', 'rejected', 'refunded')),
  entity_id uuid references public.entities (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists platform_pledges_candidate_idx
  on public.platform_pledges (candidate_id, status);

create table if not exists public.civic_credits (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance numeric not null default 0 check (balance >= 0),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.gauntlet_stances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary_id uuid not null references public.primaries (id) on delete cascade,
  prompt_id uuid not null references public.community_prompts (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint gauntlet_stances_content_check check (char_length(btrim(content)) between 20 and 500),
  constraint gauntlet_stances_unique unique (user_id, prompt_id)
);

alter table public.community_prompts
  add column if not exists entity_id uuid references public.entities (id) on delete set null;

alter table public.community_prompts alter column voter_id drop not null;

alter table public.community_prompts drop constraint if exists community_prompts_author_check;
alter table public.community_prompts
  add constraint community_prompts_author_check
  check (voter_id is not null or entity_id is not null);

alter table public.entities enable row level security;
alter table public.institutional_pledges enable row level security;
alter table public.entity_endorsements enable row level security;
alter table public.platform_pledges enable row level security;
alter table public.civic_credits enable row level security;
alter table public.gauntlet_stances enable row level security;

drop policy if exists "Public read entities" on public.entities;
create policy "Public read entities" on public.entities for select to anon, authenticated using (true);

drop policy if exists "Public read institutional pledges" on public.institutional_pledges;
create policy "Public read institutional pledges"
  on public.institutional_pledges for select to anon, authenticated using (true);

drop policy if exists "Public read entity endorsements" on public.entity_endorsements;
create policy "Public read entity endorsements"
  on public.entity_endorsements for select to anon, authenticated using (true);

drop policy if exists "Public read platform pledges" on public.platform_pledges;
create policy "Public read platform pledges"
  on public.platform_pledges for select to anon, authenticated using (true);

drop policy if exists "Read own civic credit" on public.civic_credits;
create policy "Read own civic credit"
  on public.civic_credits for select to authenticated using (user_id = auth.uid());

drop policy if exists "Public read gauntlet stances" on public.gauntlet_stances;
create policy "Public read gauntlet stances"
  on public.gauntlet_stances for select to anon, authenticated using (true);

grant select on public.entities, public.institutional_pledges, public.entity_endorsements,
  public.platform_pledges, public.gauntlet_stances
  to anon, authenticated, service_role;
grant select on public.civic_credits to authenticated, service_role;
grant insert, update, delete on public.entities, public.institutional_pledges, public.entity_endorsements,
  public.platform_pledges, public.civic_credits, public.gauntlet_stances
  to service_role;

insert into public.entities (id, slug, name, kind, summary)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'texas-teachers-union',
    'Texas Teachers Union',
    'union',
    'A union profile. It can endorse candidates and file agenda prompts. It does not debate.'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'lone-star-prosperity',
    'Lone Star Prosperity PAC',
    'pac',
    'A PAC profile. It can endorse candidates and file agenda prompts. It does not debate.'
  )
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
