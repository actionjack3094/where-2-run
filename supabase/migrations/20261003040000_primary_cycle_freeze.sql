-- Election-cycle columns, one nominee per primary, and a cancelled arena status
-- so a passed primary date can freeze the floor.

alter table public.primaries
  add column if not exists cycle_year integer,
  add column if not exists primary_date timestamptz,
  add column if not exists general_election_date timestamptz,
  add column if not exists term_length_years integer not null default 2,
  add column if not exists senate_class integer,
  add column if not exists status text not null default 'active';

update public.primaries
set
  cycle_year = coalesce(cycle_year, case
    when slug = 'ny-mayor-dem' then 2025
    else 2026
  end),
  primary_date = coalesce(primary_date, case
    when slug = 'ny-mayor-dem' then timestamptz '2025-06-24 21:00:00+00'
    when slug = 'fl-governor-rep' then timestamptz '2026-08-18 20:00:00+00'
    else timestamptz '2026-03-03 20:00:00+00'
  end),
  general_election_date = coalesce(general_election_date, case
    when slug = 'ny-mayor-dem' then timestamptz '2025-11-04 00:00:00+00'
    else timestamptz '2026-11-03 00:00:00+00'
  end),
  term_length_years = case
    when office_name ilike '%senate%' then 6
    when office_name ilike '%governor%' or office_name ilike '%mayor%' then 4
    else 2
  end,
  senate_class = case
    when office_name ilike '%senate%' and state = 'TX' then 2
    else senate_class
  end
where cycle_year is null
   or primary_date is null
   or (office_name ilike '%senate%' and senate_class is null);

alter table public.primaries
  alter column cycle_year set not null,
  alter column primary_date set not null;

alter table public.primaries drop constraint if exists primaries_status_check;
alter table public.primaries
  add constraint primaries_status_check
  check (status in ('active', 'frozen'));

alter table public.primaries drop constraint if exists primaries_senate_class_check;
alter table public.primaries
  add constraint primaries_senate_class_check
  check (senate_class is null or senate_class in (1, 2, 3));

alter table public.primaries drop constraint if exists primaries_term_length_check;
alter table public.primaries
  add constraint primaries_term_length_check
  check (term_length_years > 0);

do $$
declare
  slug_constraint text;
begin
  select con.conname into slug_constraint
  from pg_constraint con
  where con.conrelid = 'public.primaries'::regclass
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) ilike '%(slug)%';

  if slug_constraint is not null then
    execute format('alter table public.primaries drop constraint %I', slug_constraint);
  end if;
end
$$;

create unique index if not exists primaries_slug_cycle_year_key
  on public.primaries (slug, cycle_year);

create index if not exists primaries_status_date_idx
  on public.primaries (status, primary_date);

alter table public.primary_standings
  add column if not exists is_nominee boolean not null default false;

create unique index if not exists primary_standings_one_nominee_idx
  on public.primary_standings (primary_id)
  where is_nominee;

alter table public.arena_debates drop constraint if exists arena_debates_status_check;
alter table public.arena_debates
  add constraint arena_debates_status_check
  check (status in ('open_challenge', 'active', 'concluded', 'cancelled'));

comment on column public.primaries.primary_date is
  'Deadline when this intra-party arena freezes.';
comment on column public.primary_standings.is_nominee is
  'Party nominee crowned when the primary freezes. One row per primary.';

-- Ask the app to freeze primaries whose date has passed.
-- Local Docker reaches Next.js on the host. Swap the URL in production.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    create extension pg_net;
  end if;
end
$$;

create or replace function public.freeze_due_primaries()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
begin
  perform net.http_post(
    url := 'http://host.docker.internal:3000/api/cron/freeze-primaries',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer cron_sec_local_123'
    ),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.freeze_due_primaries() from public, anon, authenticated;
grant execute on function public.freeze_due_primaries() to postgres, service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'freeze-due-primaries';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'freeze-due-primaries',
  '*/15 * * * *',
  $$select public.freeze_due_primaries()$$
);

notify pgrst, 'reload schema';
