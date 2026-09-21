-- Named ideological coordinates for the baseline stance quiz.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.
--
-- candidate_stats is a view over public.users. stance_vector is stored on users
-- as JSONB, projected through the view, and writable via the INSTEAD OF UPDATE trigger.

alter table public.users
  add column if not exists stance_vector jsonb;

alter table public.users
  drop constraint if exists users_stance_vector_object_check;

alter table public.users
  add constraint users_stance_vector_object_check
  check (
    stance_vector is null
    or jsonb_typeof(stance_vector) = 'object'
  );

comment on column public.users.stance_vector is
  'Named policy-axis coordinates in [-1.0, 1.0], e.g. {"economy": 0.2, "foreign_policy": -0.4, "social": 0.8}.';

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
  'Lifetime votes, debate record, pledged total, ELO rating, verification tier, and stance vector per candidate profile.';

comment on column public.candidate_stats.stance_vector is
  'Projected from users.stance_vector. Writable through the INSTEAD OF UPDATE trigger.';

create or replace function public.candidate_stats_instead_of_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if
    NEW.elo_rating is distinct from OLD.elo_rating
    or NEW.stance_vector is distinct from OLD.stance_vector
  then
    update public.users
    set
      elo_rating = case
        when NEW.elo_rating is distinct from OLD.elo_rating then NEW.elo_rating
        else elo_rating
      end,
      stance_vector = case
        when NEW.stance_vector is distinct from OLD.stance_vector then NEW.stance_vector
        else stance_vector
      end,
      updated_at = timezone('utc'::text, now())
    where id = OLD.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists candidate_stats_instead_of_update on public.candidate_stats;
create trigger candidate_stats_instead_of_update
  instead of update on public.candidate_stats
  for each row
  execute procedure public.candidate_stats_instead_of_update();

grant select on public.candidate_stats to anon, authenticated, service_role;
grant update on public.candidate_stats to service_role;

notify pgrst, 'reload schema';
