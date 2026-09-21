-- Political coalitions and cross-district endorsements.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create table if not exists public.coalitions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  charter_statement text not null check (
    char_length(trim(charter_statement)) between 20 and 2000
  ),
  founder_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists coalitions_founder_id_idx
  on public.coalitions (founder_id);

create index if not exists coalitions_created_at_idx
  on public.coalitions (created_at desc);

comment on table public.coalitions is
  'Named electoral alliances with a public charter. Founders invite candidates across districts.';

create table if not exists public.coalition_members (
  id uuid primary key default gen_random_uuid(),
  coalition_id uuid not null references public.coalitions(id) on delete cascade,
  candidate_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (coalition_id, candidate_id)
);

create index if not exists coalition_members_candidate_status_idx
  on public.coalition_members (candidate_id, status);

create index if not exists coalition_members_coalition_status_idx
  on public.coalition_members (coalition_id, status);

comment on table public.coalition_members is
  'Junction of coalitions to candidates. pending = invited; active = seated endorsement.';

alter table public.coalitions enable row level security;
alter table public.coalition_members enable row level security;

drop policy if exists coalitions_select_public on public.coalitions;
create policy coalitions_select_public
  on public.coalitions
  for select
  to anon, authenticated
  using (true);

drop policy if exists coalitions_insert_founder on public.coalitions;
create policy coalitions_insert_founder
  on public.coalitions
  for insert
  to authenticated
  with check (founder_id = auth.uid());

drop policy if exists coalition_members_select_visible on public.coalition_members;
create policy coalition_members_select_visible
  on public.coalition_members
  for select
  to anon, authenticated
  using (
    status = 'active'
    or candidate_id = auth.uid()
  );

drop policy if exists coalition_members_insert_authenticated on public.coalition_members;
create policy coalition_members_insert_authenticated
  on public.coalition_members
  for insert
  to authenticated
  with check (
    (
      status = 'active'
      and candidate_id = auth.uid()
      and exists (
        select 1
        from public.coalitions c
        where c.id = coalition_id
          and c.founder_id = auth.uid()
      )
    )
    or (
      status = 'pending'
      and candidate_id <> auth.uid()
      and exists (
        select 1
        from public.coalition_members m
        where m.coalition_id = coalition_id
          and m.candidate_id = auth.uid()
          and m.status = 'active'
      )
    )
  );

drop policy if exists coalition_members_update_own_pending on public.coalition_members;
create policy coalition_members_update_own_pending
  on public.coalition_members
  for update
  to authenticated
  using (candidate_id = auth.uid() and status = 'pending')
  with check (candidate_id = auth.uid() and status = 'active');

grant select on public.coalitions to anon, authenticated, service_role;
grant insert on public.coalitions to authenticated, service_role;
grant delete on public.coalitions to service_role;
grant select on public.coalition_members to anon, authenticated, service_role;
grant insert, update on public.coalition_members to authenticated, service_role;

notify pgrst, 'reload schema';
