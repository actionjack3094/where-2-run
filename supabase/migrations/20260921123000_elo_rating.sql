-- ELO ratings for debate matchmaking.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.
--
-- candidate_stats is a view over public.users. elo_rating is stored on users,
-- projected through the view, and writable via an INSTEAD OF UPDATE trigger.

alter table public.users
  add column if not exists elo_rating integer not null default 1200;

alter table public.debates
  add column if not exists elo_applied_at timestamptz;

create index if not exists users_elo_rating_idx
  on public.users (elo_rating);

comment on column public.users.elo_rating is
  'Standard ELO rating used for debate matchmaking. Defaults to 1200.';

comment on column public.debates.elo_applied_at is
  'Set after winner/loser ELO has been written so ratings are applied once.';

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
  p.elo_rating
from profiles p
left join vote_totals v on v.candidate_id = p.id
left join debate_totals d on d.candidate_id = p.id
left join pledge_totals pl on pl.candidate_id = p.id;

comment on view public.candidate_stats is
  'Lifetime votes, debate record, pledged total, and ELO rating per candidate profile.';

comment on column public.candidate_stats.elo_rating is
  'Projected from users.elo_rating. Writable through the INSTEAD OF UPDATE trigger.';

create or replace function public.candidate_stats_instead_of_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.elo_rating is distinct from OLD.elo_rating then
    update public.users
    set
      elo_rating = NEW.elo_rating,
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

-- Standard ELO: expected = 1 / (1 + 10 ^ ((opp - rating) / 400)), K = 32.
create or replace function public.apply_debate_elo(debate_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debate public.debates%rowtype;
  v_winner uuid;
  v_loser uuid;
  v_winner_elo integer;
  v_loser_elo integer;
  v_expected_winner double precision;
  v_expected_loser double precision;
begin
  select * into v_debate
  from public.debates
  where id = debate_uuid
  for update;

  if v_debate.id is null then
    return;
  end if;
  if v_debate.elo_applied_at is not null then
    return;
  end if;
  if v_debate.status is distinct from 'completed' then
    return;
  end if;
  if v_debate.candidate_a_id is null or v_debate.candidate_b_id is null then
    return;
  end if;

  v_winner := public.calculate_debate_winner(debate_uuid);

  if v_winner is null then
    update public.debates
    set elo_applied_at = timezone('utc'::text, now())
    where id = debate_uuid;
    return;
  end if;

  v_loser := case
    when v_winner = v_debate.candidate_a_id then v_debate.candidate_b_id
    else v_debate.candidate_a_id
  end;

  select coalesce(elo_rating, 1200) into v_winner_elo
  from public.users
  where id = v_winner;

  select coalesce(elo_rating, 1200) into v_loser_elo
  from public.users
  where id = v_loser;

  v_expected_winner := 1.0 / (
    1.0 + power(10.0, (v_loser_elo - v_winner_elo)::double precision / 400.0)
  );
  v_expected_loser := 1.0 / (
    1.0 + power(10.0, (v_winner_elo - v_loser_elo)::double precision / 400.0)
  );

  update public.users
  set
    elo_rating = greatest(100, round(v_winner_elo + 32 * (1 - v_expected_winner))::integer),
    updated_at = timezone('utc'::text, now())
  where id = v_winner;

  update public.users
  set
    elo_rating = greatest(100, round(v_loser_elo + 32 * (0 - v_expected_loser))::integer),
    updated_at = timezone('utc'::text, now())
  where id = v_loser;

  update public.debates
  set elo_applied_at = timezone('utc'::text, now())
  where id = debate_uuid;
end;
$$;

comment on function public.apply_debate_elo(uuid) is
  'Writes new ELO ratings for both candidates after a completed debate with a declared winner.';

revoke all on function public.apply_debate_elo(uuid) from public;
grant execute on function public.apply_debate_elo(uuid) to postgres, service_role;

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
    update public.debates
    set status = 'completed'
    where expires_at < now()
      and status in ('active', 'voting')
    returning id
  loop
    perform public.apply_debate_elo(rec.id);
    debate_id := rec.id;
    winner_id := public.calculate_debate_winner(rec.id);
    return next;
  end loop;
end;
$$;

comment on function public.complete_expired_debates() is
  'Marks expired active/voting debates as completed and applies ELO. Intended for hourly pg_cron.';

notify pgrst, 'reload schema';
