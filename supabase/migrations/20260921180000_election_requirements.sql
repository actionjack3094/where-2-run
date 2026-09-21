-- Ballot access deadlines and escrow goals per matched seat.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create table if not exists public.election_requirements (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.districts(id) on delete cascade,
  state text not null,
  office text not null,
  residency_deadline timestamptz not null,
  filing_deadline timestamptz not null,
  escrow_goal numeric not null default 5000
    check (escrow_goal >= 0),
  created_at timestamptz not null default now(),
  unique (election_id)
);

create index if not exists election_requirements_election_id_idx
  on public.election_requirements (election_id);

create index if not exists election_requirements_state_idx
  on public.election_requirements (state);

comment on table public.election_requirements is
  'Ballot-access calendar and tokenized escrow goal for each district (election).';

comment on column public.election_requirements.election_id is
  'District / seat this filing calendar belongs to.';
comment on column public.election_requirements.residency_deadline is
  'Last date the candidate must have established legal residency.';
comment on column public.election_requirements.filing_deadline is
  'Last date to file candidacy papers with the clerk.';
comment on column public.election_requirements.escrow_goal is
  'Tokenized grassroots escrow target for this race.';

alter table public.election_requirements enable row level security;

drop policy if exists election_requirements_select_public on public.election_requirements;
create policy election_requirements_select_public
  on public.election_requirements
  for select
  to anon, authenticated
  using (true);

grant select on public.election_requirements to anon, authenticated, service_role;
grant insert, update, delete on public.election_requirements to service_role;

insert into public.election_requirements (
  election_id,
  state,
  office,
  residency_deadline,
  filing_deadline,
  escrow_goal
)
select
  d.id,
  coalesce(nullif(btrim(d.state), ''), 'TX'),
  d.name,
  case lower(d.level)
    when 'local' then timestamptz '2026-11-02 00:00:00+00'
    else timestamptz '2027-11-07 00:00:00+00'
  end,
  case lower(d.level)
    when 'local' then timestamptz '2027-02-19 23:59:59+00'
    else timestamptz '2027-12-13 23:59:59+00'
  end,
  case lower(d.level)
    when 'local' then 2500
    when 'state' then 5000
    else 10000
  end
from public.districts d
on conflict (election_id) do nothing;

notify pgrst, 'reload schema';
