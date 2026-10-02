-- Reopen arena seats whose 24-hour lock expired before a rebuttal was filed.
-- Legacy public.debates keeps its own expiration cron.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron;
  end if;
end
$$;

create or replace function public.release_expired_arena_seats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with released as (
    update public.arena_debates
    set
      status = 'open_challenge',
      candidate_b_id = null,
      seat_locked_until = null,
      updated_at = timezone('utc', now())
    where status = 'active'
      and stance_b is null
      and seat_locked_until is not null
      and seat_locked_until < now()
    returning prompt_id
  )
  update public.debate_prompts as prompt
  set status = 'open'
  from released
  where prompt.id = released.prompt_id
    and prompt.status = 'locked';
end;
$$;

comment on function public.release_expired_arena_seats() is
  'Returns an unrebutted arena seat to open_challenge after seat_locked_until passes.';

revoke all on function public.release_expired_arena_seats() from public, anon, authenticated;
grant execute on function public.release_expired_arena_seats() to postgres, service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'release-expired-arena-seats';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'release-expired-arena-seats',
  '* * * * *',
  $$select public.release_expired_arena_seats()$$
);
