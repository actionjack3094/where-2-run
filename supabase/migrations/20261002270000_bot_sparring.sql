-- Schedule a same-party synthetic partner for a human opening.
-- The model runs in the app worker, not in Postgres.
-- Local Docker reaches Next.js on the host. Swap the URL in production.
--   http://host.docker.internal:3000/api/cron/bot-spar
--   Bearer cron_sec_local_123

alter table public.arena_debates
  add column if not exists bot_spar_at timestamptz;

comment on column public.arena_debates.bot_spar_at is
  'When a human opening may be claimed by a same-party synthetic sparring partner.';

create index if not exists arena_debates_bot_spar_due
  on public.arena_debates (bot_spar_at)
  where status = 'open_challenge'
    and candidate_b_id is null
    and bot_spar_at is not null;

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

create or replace function public.spar_due_arena_bots()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
begin
  perform net.http_post(
    url := 'http://host.docker.internal:3000/api/cron/bot-spar',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer cron_sec_local_123'
    ),
    timeout_milliseconds := 60000
  );
end;
$$;

comment on function public.spar_due_arena_bots() is
  'Asks the app to claim human openings whose bot_spar_at grace window has elapsed.';

revoke all on function public.spar_due_arena_bots() from public, anon, authenticated;
grant execute on function public.spar_due_arena_bots() to postgres, service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'spar-due-arena-bots';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'spar-due-arena-bots',
  '* * * * *',
  $$select public.spar_due_arena_bots()$$
);
