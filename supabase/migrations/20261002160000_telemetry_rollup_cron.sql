-- Hourly spectator telemetry rollup.
-- debate_votes stay available for 7 days so anti-bot review can inspect raw rows.
-- Counts are upserted first, then only rows older than 7 days are deleted.

-- pg_cron is already installed by 20260918041300. Re-running
-- CREATE EXTENSION here fails with "dependent privileges exist".
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron;
  end if;
end
$$;

alter table public.debate_votes
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists selection text;

update public.debate_votes
set user_id = spectator_id
where user_id is null;

update public.debate_votes
set selection = voted_for_user_id::text
where selection is null and voted_for_user_id is not null;

comment on column public.debate_votes.user_id is
  'Spectator who logged the response.';
comment on column public.debate_votes.selection is
  'The spectator''s selection. Telemetry only; it does not change seated debater ratings.';

create table if not exists public.hourly_vote_aggregations (
  district_id uuid,
  topic_id uuid,
  selection text,
  hour_start timestamptz not null,
  vote_count integer not null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hourly_vote_aggregations_key
    unique nulls not distinct (district_id, topic_id, selection, hour_start)
);

comment on table public.hourly_vote_aggregations is
  'Hourly spectator telemetry counts by district, topic, and selection. Raw debate_votes are kept for 7 days.';

comment on column public.hourly_vote_aggregations.hour_start is
  'UTC hour the responses were logged. Kept after the raw rows age out.';

alter table public.hourly_vote_aggregations enable row level security;

revoke all on public.hourly_vote_aggregations from public, anon, authenticated;
grant select, insert, update, delete on public.hourly_vote_aggregations to postgres, service_role;

create or replace function public.aggregate_hourly_telemetry()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hourly_vote_aggregations (
    district_id,
    topic_id,
    selection,
    hour_start,
    vote_count,
    updated_at
  )
  select
    district_id,
    topic_id,
    selection,
    date_trunc('hour', created_at),
    count(*)::integer,
    timezone('utc', now())
  from public.debate_votes
  group by district_id, topic_id, selection, date_trunc('hour', created_at)
  on conflict (district_id, topic_id, selection, hour_start)
  do update set
    vote_count = excluded.vote_count,
    updated_at = excluded.updated_at;

  delete from public.debate_votes
  where created_at < now() - interval '7 days';
end;
$$;

comment on function public.aggregate_hourly_telemetry() is
  'Upserts hourly debate_votes counts by district, topic, and selection, then deletes raw rows older than 7 days.';

revoke all on function public.aggregate_hourly_telemetry() from public;
grant execute on function public.aggregate_hourly_telemetry() to postgres, service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'aggregate-hourly-telemetry';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'aggregate-hourly-telemetry',
  '0 * * * *',
  $$select public.aggregate_hourly_telemetry()$$
);
