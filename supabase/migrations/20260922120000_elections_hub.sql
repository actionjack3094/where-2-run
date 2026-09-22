-- Dynamic Election Hub: first-class elections, 6-axis median voter vectors,
-- and election_id foreign keys on debates + campaign pledges.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create extension if not exists vector;

-- Convert a stored ideology vector (6, 10, or other) into the hub's 6 sub-axes:
-- climate, healthcare, immigration, economy, social, safety — each in [0, 1].
create or replace function public.ideology_to_six_axis(input vector)
returns vector(6)
language plpgsql
immutable
parallel safe
as $$
declare
  raw text;
  v double precision[];
  dims integer;
  signed boolean := false;
  i integer;
  climate double precision;
  healthcare double precision;
  immigration double precision;
  economy double precision;
  social double precision;
  safety double precision;
begin
  if input is null then
    return null;
  end if;

  raw := btrim(input::text);
  if raw = '' or raw = '[]' then
    return null;
  end if;

  v := translate(raw, '[]', '{}')::double precision[];
  dims := coalesce(array_length(v, 1), 0);
  if dims = 0 then
    return null;
  end if;

  for i in 1..dims loop
    if v[i] < 0 then
      signed := true;
      exit;
    end if;
  end loop;

  if dims = 6 then
    climate := v[1];
    healthcare := v[2];
    immigration := v[3];
    economy := v[4];
    social := v[5];
    safety := v[6];
  elsif dims >= 10 and signed then
    climate := (coalesce(v[6], 0) + 1) / 2;
    healthcare := (coalesce(v[5], 0) + 1) / 2;
    immigration := (coalesce(v[7], 0) + 1) / 2;
    economy := (coalesce(v[1], 0) + 1) / 2;
    social := (coalesce(v[9], 0) + 1) / 2;
    safety := 1 - ((coalesce(v[10], 0) + 1) / 2);
  elsif dims >= 10 then
    climate := coalesce(v[1], 0.5);
    healthcare := coalesce(v[5], 0.5);
    immigration := 1 - coalesce(v[3], 0.5);
    economy := coalesce(v[10], 0.5);
    social := coalesce(v[2], 0.5);
    safety := 1 - coalesce(v[4], 0.5);
  else
    climate := coalesce(v[1], 0.5);
    healthcare := coalesce(v[5], v[2], 0.5);
    immigration := coalesce(v[3], 0.5);
    economy := coalesce(v[4], v[1], 0.5);
    social := coalesce(v[2], 0.5);
    safety := coalesce(v[6], v[3], 0.5);
  end if;

  if signed and dims = 6 then
    climate := (climate + 1) / 2;
    healthcare := (healthcare + 1) / 2;
    immigration := (immigration + 1) / 2;
    economy := (economy + 1) / 2;
    social := (social + 1) / 2;
    safety := (safety + 1) / 2;
  end if;

  return array[
    least(1, greatest(0, climate)),
    least(1, greatest(0, healthcare)),
    least(1, greatest(0, immigration)),
    least(1, greatest(0, economy)),
    least(1, greatest(0, social)),
    least(1, greatest(0, safety))
  ]::vector(6);
end;
$$;

comment on function public.ideology_to_six_axis(vector) is
  'Projects a 6- or 10-dim ideology vector onto the election hub sub-axes.';

create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  office_name text not null,
  median_voter_vector vector(6),
  incumbent_name text,
  filing_requirements jsonb not null default '{}'::jsonb,
  district_id uuid references public.districts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint elections_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint elections_filing_requirements_object_check
    check (jsonb_typeof(filing_requirements) = 'object')
);

create unique index if not exists elections_slug_idx
  on public.elections (slug);

create index if not exists elections_district_id_idx
  on public.elections (district_id);

create index if not exists elections_office_name_idx
  on public.elections (office_name);

do $$
begin
  begin
    execute $sql$
      create index if not exists elections_median_voter_vector_cosine_idx
        on public.elections
        using hnsw (median_voter_vector vector_cosine_ops)
    $sql$;
  exception
    when others then
      begin
        execute $sql$
          create index if not exists elections_median_voter_vector_cosine_idx
            on public.elections
            using ivfflat (median_voter_vector vector_cosine_ops)
            with (lists = 10)
        $sql$;
      exception
        when others then
          raise notice 'Skipping elections_median_voter_vector_cosine_idx: %', SQLERRM;
      end;
  end;
end $$;

comment on table public.elections is
  'Ballot races. Debates, pledges, and median-voter matching hang off this hub.';
comment on column public.elections.slug is
  'URL key, e.g. tx-austin-city-council-d9-2026.';
comment on column public.elections.office_name is
  'Human-readable seat title as it appears on the ballot.';
comment on column public.elections.median_voter_vector is
  'Six sub-axes: climate, healthcare, immigration, economy, social, safety.';
comment on column public.elections.incumbent_name is
  'Sitting officeholder, if the seat is occupied.';
comment on column public.elections.filing_requirements is
  'Ballot-access rules, deadlines, and campaign-treasurer steps.';
comment on column public.elections.district_id is
  'Optional link back to the geographic district used by matchmaker scores.';

alter table public.debates
  add column if not exists election_id uuid references public.elections(id) on delete set null;

create index if not exists debates_election_id_idx
  on public.debates (election_id);

comment on column public.debates.election_id is
  'Race this policy prompt is assigned to. Null for unassigned floor debates.';

-- Seed one election per district. Reuse the district UUID so existing
-- campaign_pledges.election_id rows (which currently point at districts)
-- remain valid after the foreign key is retargeted.
insert into public.elections (
  id,
  slug,
  office_name,
  median_voter_vector,
  incumbent_name,
  filing_requirements,
  district_id
)
select
  d.id,
  left(
    regexp_replace(
      regexp_replace(
        concat_ws(
          '-',
          coalesce(nullif(lower(btrim(d.state)), ''), 'us'),
          regexp_replace(lower(d.name), '[^a-z0-9]+', '-', 'g'),
          '2026'
        ),
        '-+',
        '-',
        'g'
      ),
      '(^-+)|(-+$)',
      '',
      'g'
    ),
    80
  ) || case
    when count(*) over (
      partition by left(
        regexp_replace(
          regexp_replace(
            concat_ws(
              '-',
              coalesce(nullif(lower(btrim(d.state)), ''), 'us'),
              regexp_replace(lower(d.name), '[^a-z0-9]+', '-', 'g'),
              '2026'
            ),
            '-+',
            '-',
            'g'
          ),
          '(^-+)|(-+$)',
          '',
          'g'
        ),
        80
      )
    ) > 1 then '-' || substr(replace(d.id::text, '-', ''), 1, 6)
    else ''
  end,
  d.name,
  public.ideology_to_six_axis(d.median_ideology_vector),
  null,
  jsonb_build_object(
    'jurisdiction', concat_ws(', ', nullif(btrim(d.state), ''), d.name),
    'office', d.name,
    'level', d.level,
    'state', d.state,
    'filing_deadline', case lower(d.level)
      when 'local' then '2027-02-19'
      else '2027-12-13'
    end,
    'residency_deadline', case lower(d.level)
      when 'local' then '2026-11-02'
      else '2027-11-07'
    end,
    'residency', 'Establish legal residency in the district before the residency deadline.',
    'petition_signatures', case lower(d.level)
      when 'local' then 25
      when 'state' then 500
      else 500
    end,
    'filing_fee', case lower(d.level)
      when 'local' then '$0–$350, or a nominating petition in lieu of the fee'
      when 'state' then 'Statutory filing fee or petition in lieu'
      else 'Statutory filing fee or petition in lieu'
    end,
    'ballot_access', jsonb_build_array(
      'Confirm you meet the age, citizenship, and district residency tests for this office.',
      'Appoint a campaign treasurer before accepting contributions or making expenditures.',
      'File an application for a place on the ballot with the filing authority by the deadline.',
      'Pay the filing fee or submit a valid nominating petition in lieu of the fee.',
      'Keep campaign finance reports current through the election calendar.'
    ),
    'treasurer', jsonb_build_object(
      'form', case
        when upper(coalesce(d.state, 'TX')) = 'TX' then 'Form CTA'
        else 'Campaign treasurer appointment'
      end,
      'office', case
        when upper(coalesce(d.state, 'TX')) = 'TX' then 'Texas Ethics Commission (local copy to the city/county clerk)'
        else 'State campaign-finance filing office'
      end,
      'notes', 'The treasurer appointment must be on file before the campaign accepts money or spends it. An in-district resident is required for most local seats.',
      'steps', jsonb_build_array(
        'Choose a campaign treasurer who will keep the books and sign finance reports.',
        'Complete the treasurer appointment form (Form CTA in Texas) with the candidate and treasurer signatures.',
        'File the original with the ethics commission or local clerk listed for this office.',
        'File an amended appointment before changing treasurers or their address.',
        'Do not accept contributions until the appointment is on record.'
      )
    )
  ),
  d.id
from public.districts d
on conflict (id) do update
set
  office_name = excluded.office_name,
  median_voter_vector = coalesce(excluded.median_voter_vector, public.elections.median_voter_vector),
  filing_requirements = case
    when public.elections.filing_requirements = '{}'::jsonb then excluded.filing_requirements
    else public.elections.filing_requirements
  end,
  district_id = coalesce(public.elections.district_id, excluded.district_id),
  updated_at = now();

-- Canonical Austin City Council D9 hub used throughout product copy.
update public.elections e
set
  slug = 'tx-austin-city-council-d9-2026',
  incumbent_name = coalesce(e.incumbent_name, 'Zohaib Qadri'),
  office_name = 'Austin City Council, District 9',
  filing_requirements = jsonb_build_object(
    'jurisdiction', 'Austin, Texas',
    'office', 'City Council District 9',
    'level', 'local',
    'state', 'TX',
    'filing_deadline', '2026-02-13',
    'residency_deadline', '2025-11-03',
    'residency', 'Must reside in Austin City Council District 9 and be a qualified voter of the city.',
    'petition_signatures', 25,
    'filing_fee', '$0 application; petition in lieu if required by the charter for that cycle',
    'ballot_access', jsonb_build_array(
      'Be a U.S. citizen, 18 or older, and a qualified voter of the City of Austin.',
      'Reside in Council District 9 when filing and through the term.',
      'File an Application for a Place on the Ballot with the City Clerk by 5 p.m. on filing deadline day.',
      'Submit either the filing fee set by ordinance or a nominating petition with the required valid signatures of registered voters in the district.',
      'Keep a campaign treasurer appointment on file before accepting any contribution.'
    ),
    'treasurer', jsonb_build_object(
      'form', 'Form CTA (Appointment of a Campaign Treasurer by a Candidate)',
      'office', 'Texas Ethics Commission, with a copy to the Austin City Clerk',
      'notes', 'Texas Election Code ch. 252. A candidate may not accept political contributions or make political expenditures until the treasurer appointment is filed.',
      'steps', jsonb_build_array(
        'Select a campaign treasurer (an Austin resident is strongly preferred for a city race).',
        'Complete Form CTA: candidate name, office sought (Austin City Council District 9), treasurer name, address, and phone.',
        'Candidate and treasurer both sign. The treasurer acknowledges the duty to file campaign finance reports.',
        'File the original with the Texas Ethics Commission; file a copy with the Austin City Clerk.',
        'File Form ACTA before replacing a treasurer. File C/OH reports on the city clerk calendar once appointed.'
      )
    )
  ),
  updated_at = now()
where e.district_id in (
  select d.id
  from public.districts d
  where d.name ilike '%austin city council%district 9%'
     or d.name ilike '%austin city council - district 9%'
);

update public.debates d
set election_id = d.district_id
where d.election_id is null
  and d.district_id is not null
  and exists (
    select 1 from public.elections e where e.id = d.district_id
  );

-- Retarget campaign_pledges.election_id from districts → elections.
-- Existing rows already store district UUIDs; elections were seeded with those ids.
do $$
declare
  rec record;
begin
  if to_regclass('public.campaign_pledges') is null then
    return;
  end if;

  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.campaign_pledges'::regclass
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%election_id%'
  loop
    execute format('alter table public.campaign_pledges drop constraint if exists %I', rec.conname);
  end loop;

  -- Drop pledges whose election_id is not a seeded election (should be none).
  delete from public.campaign_pledges p
  where p.election_id is not null
    and not exists (
      select 1 from public.elections e where e.id = p.election_id
    );

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_pledges'::regclass
      and conname = 'campaign_pledges_election_id_fkey'
  ) then
    alter table public.campaign_pledges
      add constraint campaign_pledges_election_id_fkey
      foreign key (election_id) references public.elections(id) on delete cascade;
  end if;
end $$;

alter table public.elections enable row level security;

drop policy if exists elections_select_public on public.elections;
create policy elections_select_public
  on public.elections
  for select
  to anon, authenticated
  using (true);

grant select on public.elections to anon, authenticated, service_role;
grant insert, update, delete on public.elections to service_role;

revoke all on function public.ideology_to_six_axis(vector) from public;
grant execute on function public.ideology_to_six_axis(vector)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
