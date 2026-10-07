-- Nationwide primaries: US Senate races, the candidates filed in them,
-- and the community and debate prompts attached to each race.
--
-- public.primaries and public.candidates already exist for the arena and
-- candidate tickets. Create the requested shape when a table is missing,
-- then add the nationwide columns onto the live tables.

create table if not exists public.primaries (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  office text not null default 'US Senate',
  election_date date
);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  primary_id uuid references public.primaries (id) on delete set null,
  ideological_vector jsonb
);

create table if not exists public.primary_questions (
  id uuid primary key default gen_random_uuid(),
  primary_id uuid not null references public.primaries (id) on delete cascade,
  prompt text not null,
  kind text not null check (kind in ('community', 'debate')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint primary_questions_prompt_check check (char_length(btrim(prompt)) between 1 and 2000)
);

alter table public.primaries
  add column if not exists office text,
  add column if not exists election_date date;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'primaries'
      and column_name = 'office_name'
  ) then
    update public.primaries
    set office = coalesce(nullif(btrim(office), ''), office_name, 'US Senate')
    where office is null or btrim(office) = '';
  else
    update public.primaries
    set office = coalesce(nullif(btrim(office), ''), 'US Senate')
    where office is null or btrim(office) = '';
  end if;
end $$;

alter table public.primaries
  alter column office set default 'US Senate';

alter table public.primaries
  alter column office set not null;

alter table public.candidates
  add column if not exists primary_id uuid references public.primaries (id) on delete set null,
  add column if not exists ideological_vector jsonb;

create index if not exists candidates_primary_id_idx
  on public.candidates (primary_id);

create index if not exists primary_questions_primary_idx
  on public.primary_questions (primary_id, kind, created_at desc);

comment on column public.primaries.office is
  'Office on the ballot. New nationwide rows default to US Senate.';
comment on column public.primaries.election_date is
  'Election day for this nationwide primary.';
comment on column public.candidates.primary_id is
  'Nationwide primary this candidate is linked to.';
comment on column public.candidates.ideological_vector is
  'Ideological coordinate stored for a candidate in a nationwide primary.';
comment on table public.primary_questions is
  'Community and debate prompts linked to a nationwide primary.';

alter table public.primaries enable row level security;
alter table public.candidates enable row level security;
alter table public.primary_questions enable row level security;

drop policy if exists "Public read primaries" on public.primaries;
create policy "Public read primaries"
  on public.primaries
  for select
  to anon, authenticated
  using (true);

drop policy if exists candidates_select_public on public.candidates;
create policy candidates_select_public
  on public.candidates
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read primary questions" on public.primary_questions;
create policy "Public read primary questions"
  on public.primary_questions
  for select
  to anon, authenticated
  using (true);

grant select on public.primaries, public.candidates, public.primary_questions
  to anon, authenticated;
grant select, insert, update, delete on public.primary_questions to service_role;

notify pgrst, 'reload schema';
