-- Phase 5: Hourly Vote Aggregation & Cron Jobs
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

-- 1. Enable pg_cron (Supabase Cron)
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 3. Aggregate final ballots and return the winning candidate id.
--    Returns null when there are no votes or the top tally is tied.
create or replace function public.calculate_debate_winner(debate_uuid uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  with debate_row as (
    select candidate_a_id, candidate_b_id
    from public.debates
    where id = debate_uuid
  ),
  tallies as (
    select
      v.candidate_id,
      count(*)::int as vote_count
    from public.votes v
    cross join debate_row d
    where v.debate_id = debate_uuid
      and v.candidate_id in (d.candidate_a_id, d.candidate_b_id)
    group by v.candidate_id
  ),
  ranked as (
    select
      candidate_id,
      vote_count,
      rank() over (order by vote_count desc) as place
    from tallies
  )
  select candidate_id
  from ranked
  where place = 1
    and (select count(*) from ranked where place = 1) = 1;
$$;

comment on function public.calculate_debate_winner(uuid) is
  'Returns the winning candidate id from votes. Null on a tie or if no ballots were cast.';

revoke all on function public.calculate_debate_winner(uuid) from public;
grant execute on function public.calculate_debate_winner(uuid)
  to anon, authenticated, service_role;

-- Close expired active/voting debates. Called by the hourly cron job.
create or replace function public.complete_expired_debates()
returns table (debate_id uuid, winner_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with expired as (
    update public.debates
    set status = 'completed'
    where expires_at < now()
      and status in ('active', 'voting')
    returning id
  )
  select e.id, public.calculate_debate_winner(e.id)
  from expired e;
end;
$$;

comment on function public.complete_expired_debates() is
  'Marks expired active/voting debates as completed. Intended for hourly pg_cron.';

revoke all on function public.complete_expired_debates() from public;
revoke all on function public.complete_expired_debates() from anon, authenticated;
grant execute on function public.complete_expired_debates() to postgres, service_role;

-- 2. Hourly schedule: expire past-due debates and close the floor.
--    Re-running this migration upserts the job by name.
select cron.schedule(
  'complete-expired-debates-hourly',
  '0 * * * *',
  $$select public.complete_expired_debates()$$
);
