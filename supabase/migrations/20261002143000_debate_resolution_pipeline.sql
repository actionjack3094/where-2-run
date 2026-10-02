-- Tournament adjudication statuses and the timestamp written with ratings.
-- Spectator rows in debate_votes stay telemetry. They are not a ballot and
-- they do not feed Elo. Resolution is status = concluded, or the match timer
-- expiring. The app then writes ratings and sets status = resolved.

alter table public.debates
  add column if not exists resolved_at timestamptz;

alter table public.debates
  drop constraint if exists debates_status_check;

alter table public.debates
  add constraint debates_status_check
  check (status in (
    'waiting',
    'matching',
    'in_progress',
    'active',
    'voting',
    'concluded',
    'completed',
    'resolved',
    'expired'
  ));

comment on column public.debates.status is
  'waiting, matching, in_progress, active, voting, concluded, completed, resolved, expired. concluded or an expired match timer starts resolution. resolved means ratings and match history are written.';

comment on column public.debates.resolved_at is
  'When both debaters'' ratings and this match were recorded. Null until status is resolved.';

comment on column public.debates.winner_id is
  'Official match winner. Null on a tie or before resolution. debate_votes is not an input.';

-- Win-loss on candidate_stats is derived from settled debates. Count resolved
-- rows by the stored winner so a tie stays a tie and spectator telemetry is
-- not recounted.
create or replace view public.candidate_stats
with (security_invoker = true)
as
with profiles as (
  select
    id,
    username,
    ideology_vector,
    target_district_id,
    viability_score,
    tier,
    is_verified,
    elo_rating,
    verification_tier,
    stance_vector,
    created_at,
    updated_at
  from public.users
),
vote_totals as (
  select
    candidate_id,
    count(*)::int as total_votes
  from public.votes
  group by candidate_id
),
completed_debates as (
  select
    d.id,
    d.candidate_a_id,
    d.candidate_b_id,
    case
      when d.status = 'resolved' then d.winner_id
      else coalesce(d.winner_id, public.calculate_debate_winner(d.id))
    end as winner_id
  from public.debates d
  where d.status in ('completed', 'resolved')
),
debate_totals as (
  select
    p.id as candidate_id,
    count(c.id)::int as debates_played,
    count(c.id) filter (where c.winner_id = p.id)::int as debates_won
  from profiles p
  left join completed_debates c
    on p.id in (c.candidate_a_id, c.candidate_b_id)
  group by p.id
),
pledge_totals as (
  select
    candidate_id,
    coalesce(sum(amount), 0) as total_pledged
  from public.pledges
  group by candidate_id
)
select
  p.id,
  p.username,
  p.ideology_vector,
  p.target_district_id,
  p.viability_score,
  p.tier,
  p.is_verified,
  p.created_at,
  p.updated_at,
  coalesce(v.total_votes, 0) as total_votes,
  coalesce(d.debates_won, 0) as debates_won,
  coalesce(d.debates_played, 0) as debates_played,
  case
    when coalesce(d.debates_played, 0) = 0 then 0::numeric
    else round((d.debates_won::numeric / d.debates_played::numeric) * 100, 1)
  end as win_percentage,
  coalesce(pl.total_pledged, 0) as total_pledged,
  p.elo_rating,
  p.verification_tier,
  p.stance_vector
from profiles p
left join vote_totals v on v.candidate_id = p.id
left join debate_totals d on d.candidate_id = p.id
left join pledge_totals pl on pl.candidate_id = p.id;

comment on view public.candidate_stats is
  'Lifetime votes, debate record, pledged total, ELO rating, verification tier, and stance vector per candidate profile. Resolved debates count toward the record by their stored winner.';

grant select on public.candidate_stats to anon, authenticated, service_role;
grant update on public.candidate_stats to service_role;

-- Hourly cron only closes the floor. Rating writes happen in
-- lib/actions/debate-resolution.ts via calculateDebateElo.
create or replace function public.complete_expired_debates()
returns table (debate_id uuid, winner_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in
    update public.debates d
    set status = 'concluded'
    where d.expires_at < now()
      and d.status in ('in_progress', 'active', 'voting', 'matching')
      and d.candidate_a_id is not null
      and d.candidate_b_id is not null
      and d.elo_applied_at is null
      and not exists (
        select 1
        from public.arbitration_cases c
        where c.debate_id = d.id
          and c.status = 'open'
          and c.holds_elo
      )
    returning d.id
  loop
    debate_id := rec.id;
    winner_id := null;
    return next;
  end loop;
end;
$$;

comment on function public.complete_expired_debates() is
  'Marks expired seated debates as concluded so the app can write ratings. Does not read debate_votes and does not change Elo.';

notify pgrst, 'reload schema';
