-- Drop the punitive jury / Tier-2 truth model.
-- Rank candidates with World Football Elo inside nationwide ideological tournaments.
-- Physical district remains only as the spectator (Blue) feed fence.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- 1. Drop jury / Tier-2 tables (dependents first)
-- ---------------------------------------------------------------------------

drop table if exists public.jury_verdicts cascade;
drop table if exists public.jury_appeals cascade;
drop table if exists public.jury_votes cascade;
drop table if exists public.tier2_verifications cascade;

-- Notification types that only existed for jury duty.
alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in (
    'pledge_received',
    'coalition_invite',
    'challenge_received',
    'payout_disbursed',
    'pledge_funded'
  ));

comment on column public.user_notifications.type is
  'pledge_received, coalition_invite, challenge_received, payout_disbursed, or pledge_funded.';

-- ---------------------------------------------------------------------------
-- 2. user_ideologies — dedicated ideological vector per user
-- ---------------------------------------------------------------------------

create table if not exists public.user_ideologies (
  user_id uuid primary key references public.users(id) on delete cascade,
  vector_data vector(10),
  scores jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

comment on table public.user_ideologies is
  'Ideological coordinates used for nationwide primary matchmaking. Physical location is ignored.';

comment on column public.user_ideologies.vector_data is
  'Ten-axis ideology vector, mirrored from users.ideology_vector.';

comment on column public.user_ideologies.scores is
  'Named axis scores (json object) for the same vector.';

do $$
begin
  begin
    execute 'create index if not exists user_ideologies_vector_cosine_idx on public.user_ideologies using hnsw (vector_data vector_cosine_ops)';
  exception
    when others then
      begin
        execute 'create index if not exists user_ideologies_vector_cosine_idx on public.user_ideologies using ivfflat (vector_data vector_cosine_ops) with (lists = 10)';
      exception
        when others then
          raise notice 'Skipping user_ideologies_vector_cosine_idx: %', SQLERRM;
      end;
  end;
end $$;

insert into public.user_ideologies (user_id, vector_data, scores)
select
  u.id,
  u.ideology_vector,
  to_jsonb(translate(btrim(u.ideology_vector::text), '[]', '{}')::double precision[])
from public.users u
where u.ideology_vector is not null
on conflict (user_id) do update
  set vector_data = excluded.vector_data,
      scores = excluded.scores,
      updated_at = timezone('utc'::text, now());

create or replace function public.sync_user_ideology()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.ideology_vector is null then
    return NEW;
  end if;

  insert into public.user_ideologies (user_id, vector_data, scores, updated_at)
  values (
    NEW.id,
    NEW.ideology_vector,
    to_jsonb(translate(btrim(NEW.ideology_vector::text), '[]', '{}')::double precision[]),
    timezone('utc'::text, now())
  )
  on conflict (user_id) do update
    set vector_data = excluded.vector_data,
        scores = excluded.scores,
        updated_at = excluded.updated_at;

  return NEW;
end;
$$;

drop trigger if exists users_sync_user_ideology on public.users;
create trigger users_sync_user_ideology
  after insert or update of ideology_vector on public.users
  for each row
  execute procedure public.sync_user_ideology();

alter table public.user_ideologies enable row level security;

drop policy if exists user_ideologies_select_public on public.user_ideologies;
create policy user_ideologies_select_public
  on public.user_ideologies
  for select
  to anon, authenticated
  using (true);

drop policy if exists user_ideologies_upsert_own on public.user_ideologies;
create policy user_ideologies_upsert_own
  on public.user_ideologies
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select on public.user_ideologies to anon, authenticated, service_role;
grant insert, update, delete on public.user_ideologies to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. tournament_participants — Elo is per (user, election)
-- ---------------------------------------------------------------------------

create table if not exists public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  election_id uuid not null references public.elections(id) on delete cascade,
  elo_rating integer not null default 1200,
  matches_played integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint tournament_participants_user_election_key unique (user_id, election_id),
  constraint tournament_participants_elo_min check (elo_rating >= 100),
  constraint tournament_participants_matches_nonneg check (matches_played >= 0)
);

comment on table public.tournament_participants is
  'Nationwide primary tournament roster. Placement is ideological; Elo is local to the election.';

create index if not exists tournament_participants_election_elo_idx
  on public.tournament_participants (election_id, elo_rating desc);

create index if not exists tournament_participants_user_idx
  on public.tournament_participants (user_id);

alter table public.tournament_participants enable row level security;

drop policy if exists tournament_participants_select_public on public.tournament_participants;
create policy tournament_participants_select_public
  on public.tournament_participants
  for select
  to anon, authenticated
  using (true);

drop policy if exists tournament_participants_insert_own on public.tournament_participants;
create policy tournament_participants_insert_own
  on public.tournament_participants
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists tournament_participants_update_own on public.tournament_participants;
create policy tournament_participants_update_own
  on public.tournament_participants
  for update
  to authenticated
  using (user_id = auth.uid());

grant select on public.tournament_participants to anon, authenticated, service_role;
grant insert, update, delete on public.tournament_participants to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. debate_votes — spectator ballots that feed the Elo G-factor
-- ---------------------------------------------------------------------------

create table if not exists public.debate_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.debates(id) on delete cascade,
  spectator_id uuid not null references public.users(id) on delete cascade,
  vote_for_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint debate_votes_match_spectator_key unique (match_id, spectator_id)
);

comment on table public.debate_votes is
  'One spectator ballot per debate. The vote split is the World Football Elo G-factor.';

create index if not exists debate_votes_match_idx
  on public.debate_votes (match_id, vote_for_user_id);

alter table public.debate_votes enable row level security;

drop policy if exists debate_votes_select_public on public.debate_votes;
create policy debate_votes_select_public
  on public.debate_votes
  for select
  to anon, authenticated
  using (true);

drop policy if exists debate_votes_insert_own on public.debate_votes;
create policy debate_votes_insert_own
  on public.debate_votes
  for insert
  to authenticated
  with check (spectator_id = auth.uid());

grant select on public.debate_votes to anon, authenticated, service_role;
grant insert on public.debate_votes to authenticated, service_role;

-- Copy existing live ballots so Elo can read debate_votes immediately.
insert into public.debate_votes (match_id, spectator_id, vote_for_user_id, created_at)
select v.debate_id, v.voter_id, v.candidate_id, v.created_at
from public.votes v
where v.voided_at is null
on conflict (match_id, spectator_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Nationwide ideological match RPC (location is ignored)
-- ---------------------------------------------------------------------------

create or replace function public.find_ideological_matches(
  p_user_id uuid,
  match_count integer default 25
)
returns table (
  id uuid,
  username text,
  elo_rating integer,
  vector_data vector(10),
  cosine_distance double precision,
  similarity double precision
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit integer;
begin
  if p_user_id is null then
    return;
  end if;

  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'Cannot matchmake for another user';
  end if;

  v_limit := greatest(1, least(coalesce(match_count, 25), 50));

  return query
  select
    opponent_user.id,
    opponent_user.username,
    coalesce(opponent_user.elo_rating, 1200),
    opponent.vector_data,
    (opponent.vector_data <=> viewer.vector_data)::double precision as cosine_distance,
    (1 - (opponent.vector_data <=> viewer.vector_data))::double precision as similarity
  from public.user_ideologies as viewer
  join public.user_ideologies as opponent
    on opponent.user_id <> viewer.user_id
    and opponent.vector_data is not null
  join public.users as opponent_user
    on opponent_user.id = opponent.user_id
  where viewer.user_id = p_user_id
    and viewer.vector_data is not null
  order by opponent.vector_data <=> viewer.vector_data
  limit v_limit;
end;
$$;

comment on function public.find_ideological_matches(uuid, integer) is
  'Closest ideological users nationwide. Physical district is not a filter.';

revoke all on function public.find_ideological_matches(uuid, integer) from public;
grant execute on function public.find_ideological_matches(uuid, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Winner + Elo: equal spectator votes, World Football G-factor
-- ---------------------------------------------------------------------------

create or replace function public.calculate_debate_winner(debate_uuid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with debate_row as (
    select d.candidate_a_id, d.candidate_b_id
    from public.debates d
    where d.id = debate_uuid
  ),
  spectator_tallies as (
    select
      dv.vote_for_user_id as candidate_id,
      count(*)::int as vote_count
    from public.debate_votes dv
    cross join debate_row d
    where dv.match_id = debate_uuid
      and dv.vote_for_user_id in (d.candidate_a_id, d.candidate_b_id)
    group by dv.vote_for_user_id
  ),
  legacy_tallies as (
    select
      v.candidate_id,
      count(*)::int as vote_count
    from public.votes v
    cross join debate_row d
    where v.debate_id = debate_uuid
      and v.voided_at is null
      and v.candidate_id in (d.candidate_a_id, d.candidate_b_id)
    group by v.candidate_id
  ),
  tallies as (
    select * from spectator_tallies
    union all
    select * from legacy_tallies
    where not exists (select 1 from spectator_tallies)
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
  'Winning candidate from equal-weight spectator ballots. Null on a tie or empty ballot.';

drop function if exists public.apply_debate_elo(uuid);
drop function if exists public.apply_debate_elo(uuid, integer);

-- World Football Elo:
--   W_e = 1 / (10^(-dr/400) + 1)
--   G   maps vote margin so 51/49 → 1.0 and 80/20 → 2.5
--   R'  = R + K * G * (W - W_e)
create or replace function public.apply_debate_elo(debate_uuid uuid, p_k integer default 20)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debate public.debates%rowtype;
  v_winner uuid;
  v_loser uuid;
  v_winner_votes integer := 0;
  v_loser_votes integer := 0;
  v_total integer := 0;
  v_margin double precision;
  v_goals integer;
  v_g double precision := 1.0;
  v_k integer;
  v_winner_elo integer := 1200;
  v_loser_elo integer := 1200;
  v_we_winner double precision;
  v_we_loser double precision;
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

  select count(*)::int into v_winner_votes
  from public.debate_votes
  where match_id = debate_uuid and vote_for_user_id = v_winner;

  select count(*)::int into v_loser_votes
  from public.debate_votes
  where match_id = debate_uuid and vote_for_user_id = v_loser;

  if v_winner_votes + v_loser_votes = 0 then
    select count(*)::int into v_winner_votes
    from public.votes
    where debate_id = debate_uuid and candidate_id = v_winner and voided_at is null;

    select count(*)::int into v_loser_votes
    from public.votes
    where debate_id = debate_uuid and candidate_id = v_loser and voided_at is null;
  end if;

  v_total := v_winner_votes + v_loser_votes;
  if v_total > 0 then
    v_margin := abs((v_winner_votes::double precision / v_total)
      - (v_loser_votes::double precision / v_total));
    -- 51/49 → N≈0, G=1. 80/20 → N=9, G=2.5. World Football: (11+N)/8 for N>=3.
    v_goals := round(v_margin * 15.0);
    if v_goals <= 1 then
      v_g := 1.0;
    elsif v_goals = 2 then
      v_g := 1.5;
    else
      v_g := (11.0 + v_goals) / 8.0;
    end if;
  end if;

  v_k := greatest(1, coalesce(p_k, 20));

  if v_debate.election_id is not null then
    insert into public.tournament_participants (user_id, election_id)
    values (v_winner, v_debate.election_id), (v_loser, v_debate.election_id)
    on conflict (user_id, election_id) do nothing;

    select elo_rating into v_winner_elo
    from public.tournament_participants
    where user_id = v_winner and election_id = v_debate.election_id;

    select elo_rating into v_loser_elo
    from public.tournament_participants
    where user_id = v_loser and election_id = v_debate.election_id;
  else
    select coalesce(elo_rating, 1200) into v_winner_elo from public.users where id = v_winner;
    select coalesce(elo_rating, 1200) into v_loser_elo from public.users where id = v_loser;
  end if;

  v_we_winner := 1.0 / (power(10.0, -((v_winner_elo - v_loser_elo)::double precision) / 400.0) + 1.0);
  v_we_loser := 1.0 / (power(10.0, -((v_loser_elo - v_winner_elo)::double precision) / 400.0) + 1.0);

  if v_debate.election_id is not null then
    update public.tournament_participants
    set
      elo_rating = greatest(100, round(v_winner_elo + v_k * v_g * (1.0 - v_we_winner))::integer),
      matches_played = matches_played + 1,
      updated_at = timezone('utc'::text, now())
    where user_id = v_winner and election_id = v_debate.election_id;

    update public.tournament_participants
    set
      elo_rating = greatest(100, round(v_loser_elo + v_k * v_g * (0.0 - v_we_loser))::integer),
      matches_played = matches_played + 1,
      updated_at = timezone('utc'::text, now())
    where user_id = v_loser and election_id = v_debate.election_id;
  end if;

  update public.users
  set
    elo_rating = greatest(100, round(v_winner_elo + v_k * v_g * (1.0 - v_we_winner))::integer),
    updated_at = timezone('utc'::text, now())
  where id = v_winner;

  update public.users
  set
    elo_rating = greatest(100, round(v_loser_elo + v_k * v_g * (0.0 - v_we_loser))::integer),
    updated_at = timezone('utc'::text, now())
  where id = v_loser;

  update public.debates
  set elo_applied_at = timezone('utc'::text, now())
  where id = debate_uuid;
end;
$$;

comment on function public.apply_debate_elo(uuid, integer) is
  'Applies World Football Elo (K * G * (W - We)) from the spectator vote margin. Writes tournament_participants when the debate has an election. p_k defaults to 20 (early stages).';

notify pgrst, 'reload schema';
