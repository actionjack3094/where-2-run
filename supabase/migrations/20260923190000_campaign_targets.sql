-- Campaign targeting and the residency window used by the eligibility roadmap.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.elections
  add column if not exists residency_requirement_days integer,
  add column if not exists election_date date;

alter table public.elections
  drop constraint if exists elections_residency_requirement_days_check;

alter table public.elections
  add constraint elections_residency_requirement_days_check
  check (
    residency_requirement_days is null
    or residency_requirement_days >= 0
  );

comment on column public.elections.residency_requirement_days is
  'Days of district residency the statute requires before election day. The roadmap subtracts this from election_date.';

comment on column public.elections.election_date is
  'Election day for this race. Relocation deadline is this date minus residency_requirement_days.';

-- Demo calendar: 2026 general election day, with a district-residency window by level.
-- Federal House inhabitancy is measured on election day (0). State legislative
-- seats in this seed use one year in the district (365). Local seats use 180.
update public.elections
set election_date = date '2026-11-03'
where election_date is null
  and slug like '%2026%';

update public.elections
set residency_requirement_days = case lower(coalesce(filing_requirements->>'level', ''))
  when 'federal' then 0
  when 'state' then 365
  when 'local' then 180
  else residency_requirement_days
end
where residency_requirement_days is null
  and lower(coalesce(filing_requirements->>'level', '')) in ('federal', 'state', 'local');

create table if not exists public.campaign_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  election_id uuid not null references public.elections(id) on delete cascade,
  status text not null default 'exploring'
    check (status in ('exploring', 'relocating', 'filed')),
  created_at timestamptz not null default now(),
  constraint campaign_targets_user_election_key unique (user_id, election_id)
);

create index if not exists campaign_targets_user_id_idx
  on public.campaign_targets (user_id, created_at desc);

comment on table public.campaign_targets is
  'Races a candidate is exploring, relocating for, or has filed in.';

comment on column public.campaign_targets.status is
  'exploring, relocating, or filed.';

alter table public.campaign_targets enable row level security;

drop policy if exists campaign_targets_select_own on public.campaign_targets;
create policy campaign_targets_select_own
  on public.campaign_targets
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists campaign_targets_insert_own on public.campaign_targets;
create policy campaign_targets_insert_own
  on public.campaign_targets
  for insert
  to authenticated
  with check (user_id = auth.uid());

grant select, insert on public.campaign_targets to authenticated;
grant select, insert, update, delete on public.campaign_targets to service_role;

notify pgrst, 'reload schema';
