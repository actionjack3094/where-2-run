-- Phase 6: Candidate Dashboards & District Leaderboards
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

-- Candidate profiles live in public.users (the app's profiles table).
-- This view joins profiles, votes, and debates to produce lifetime stats.

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
    public.calculate_debate_winner(d.id) as winner_id
  from public.debates d
  where d.status = 'completed'
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
  end as win_percentage
from profiles p
left join vote_totals v on v.candidate_id = p.id
left join debate_totals d on d.candidate_id = p.id;

comment on view public.candidate_stats is
  'Lifetime votes received, debates won, and win percentage per candidate profile.';

grant select on public.candidate_stats to anon, authenticated, service_role;

notify pgrst, 'reload schema';
