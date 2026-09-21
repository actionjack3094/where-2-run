-- Ideological matchmaker: pgvector stance coordinates + cosine-distance RPC.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.
--
-- candidate_stats is a view over public.users. stance_vector is stored on users
-- as vector(5) — economy, foreign_policy, social, environment, immigration —
-- and projected through the view. Cosine distance (<=>) ranks primary opponents.

create extension if not exists vector;

-- Drop the view so the underlying column type can change.
drop view if exists public.candidate_stats;

alter table public.users
  drop constraint if exists users_stance_vector_object_check;

do $$
declare
  col_type text;
begin
  select t.typname
  into col_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid
  where n.nspname = 'public'
    and c.relname = 'users'
    and a.attname = 'stance_vector'
    and a.attnum > 0
    and not a.attisdropped;

  if col_type is null then
    execute 'alter table public.users add column stance_vector vector(5)';
  elsif col_type = 'jsonb' then
    execute $sql$
      alter table public.users
        alter column stance_vector drop default,
        alter column stance_vector type vector(5)
        using (
          case
            when stance_vector is null then null
            when jsonb_typeof(stance_vector) = 'array' then
              array[
                least(1, greatest(-1, coalesce((stance_vector->>0)::double precision, 0))),
                least(1, greatest(-1, coalesce((stance_vector->>1)::double precision, 0))),
                least(1, greatest(-1, coalesce((stance_vector->>2)::double precision, 0))),
                least(1, greatest(-1, coalesce((stance_vector->>3)::double precision, 0))),
                least(1, greatest(-1, coalesce((stance_vector->>4)::double precision, 0)))
              ]::vector(5)
            when jsonb_typeof(stance_vector) = 'object' then
              array[
                least(1, greatest(-1, coalesce((stance_vector->>'economy')::double precision, 0))),
                least(1, greatest(-1, coalesce((stance_vector->>'foreign_policy')::double precision, 0))),
                least(1, greatest(-1, coalesce((stance_vector->>'social')::double precision, 0))),
                least(1, greatest(-1, coalesce((stance_vector->>'environment')::double precision, 0))),
                least(1, greatest(-1, coalesce((stance_vector->>'immigration')::double precision, 0)))
              ]::vector(5)
            else null
          end
        )
    $sql$;
  elsif col_type <> 'vector' then
    execute 'alter table public.users alter column stance_vector type vector(5) using stance_vector::text::vector(5)';
  end if;
end $$;

comment on column public.users.stance_vector is
  'Five-axis baseline quiz coordinates in [-1, 1]: economy, foreign_policy, social, environment, immigration. Ranked with pgvector cosine distance.';

do $$
begin
  execute 'create index if not exists users_stance_vector_cosine_idx on public.users using hnsw (stance_vector vector_cosine_ops)';
exception
  when others then
    execute 'create index if not exists users_stance_vector_cosine_idx on public.users using ivfflat (stance_vector vector_cosine_ops) with (lists = 10)';
end $$;

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
  'Projected from users.stance_vector as vector(5). Writable through the INSTEAD OF UPDATE trigger.';

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

-- Smallest cosine distance (<=>) = highest ideological similarity.
-- Used to surface primary-lane opponents rather than general-election opposites.
create or replace function public.find_primary_opponents(
  p_user_id uuid,
  match_count integer default 3
)
returns table (
  id uuid,
  username text,
  verification_tier text,
  elo_rating integer,
  target_district_id uuid,
  stance_vector vector(5),
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

  v_limit := greatest(1, least(coalesce(match_count, 3), 25));

  return query
  select
    opponent.id,
    opponent.username,
    opponent.verification_tier,
    opponent.elo_rating,
    opponent.target_district_id,
    opponent.stance_vector,
    (opponent.stance_vector <=> viewer.stance_vector)::double precision as cosine_distance,
    (1 - (opponent.stance_vector <=> viewer.stance_vector))::double precision as similarity
  from public.users as viewer
  join public.users as opponent
    on opponent.id <> viewer.id
    and opponent.stance_vector is not null
    and opponent.stance_vector <> '[0,0,0,0,0]'::vector(5)
  where viewer.id = p_user_id
    and viewer.stance_vector is not null
    and viewer.stance_vector <> '[0,0,0,0,0]'::vector(5)
  order by opponent.stance_vector <=> viewer.stance_vector
  limit v_limit;
end;
$$;

comment on function public.find_primary_opponents(uuid, integer) is
  'Returns users with the smallest pgvector cosine distance (<=>) to the caller''s stance_vector — the closest ideological matches for a primary.';

revoke all on function public.find_primary_opponents(uuid, integer) from public;
grant execute on function public.find_primary_opponents(uuid, integer)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
