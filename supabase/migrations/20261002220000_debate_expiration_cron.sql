-- Every minute, close expired floors and ask the app to grade them.
-- There is no stored status named live. A live floor is active, in_progress,
-- voting, or the literal live value once it is allowed. The app writes Elo
-- after POST /api/webhooks/judge returns.
--
-- Local Docker reaches the Next.js app on the host. Swap this URL for production.
--   http://host.docker.internal:3000/api/webhooks/judge
--   Bearer cron_sec_local_123

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

alter table public.debates
  drop constraint if exists debates_status_check;

alter table public.debates
  add constraint debates_status_check
  check (status in (
    'waiting',
    'matching',
    'in_progress',
    'active',
    'live',
    'voting',
    'concluded',
    'completed',
    'resolved',
    'expired'
  ));

create or replace function public.expire_and_judge_debates()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  debate uuid;
begin
  update public.debates d
  set status = 'concluded'
  where d.expires_at is not null
    and d.expires_at <= now()
    and d.status in ('live', 'active', 'in_progress', 'voting', 'matching')
    and d.candidate_a_id is not null
    and d.candidate_b_id is not null
    and d.elo_applied_at is null
    and not exists (
      select 1
      from public.arbitration_cases c
      where c.debate_id = d.id
        and c.status = 'open'
        and c.holds_elo
    );

  for debate in
    select d.id
    from public.debates d
    where d.status = 'concluded'
      and d.elo_applied_at is null
      and d.expires_at is not null
      and d.expires_at <= now()
      and d.candidate_a_id is not null
      and d.candidate_b_id is not null
  loop
    perform net.http_post(
      url := 'http://host.docker.internal:3000/api/webhooks/judge',
      body := jsonb_build_object('debate_id', debate),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer cron_sec_local_123'
      ),
      timeout_milliseconds := 60000
    );
  end loop;
end;
$$;

comment on function public.expire_and_judge_debates() is
  'Sets expired live floors to concluded and POSTs each unresolved debate id to the judge webhook.';

revoke all on function public.expire_and_judge_debates() from public, anon, authenticated;
grant execute on function public.expire_and_judge_debates() to postgres, service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'expire-and-judge-debates';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'expire-and-judge-debates',
  '* * * * *',
  $$select public.expire_and_judge_debates()$$
);
