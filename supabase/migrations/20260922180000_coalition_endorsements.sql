-- Directed coalition endorsements and six-axis compatibility.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.
--
-- public.coalitions already stores named alliance charters (name, charter,
-- founder). This ledger is the pairwise endorsement graph: one row per
-- endorser → endorsed campaign, with a unique pair so the same user cannot
-- endorse the same campaign twice.

create extension if not exists vector;

create table if not exists public.coalition_endorsements (
  id uuid primary key default gen_random_uuid(),
  endorser_id uuid not null references public.users(id) on delete cascade,
  endorsed_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint coalition_endorsements_not_self_check check (endorser_id <> endorsed_id),
  constraint coalition_endorsements_pair_key unique (endorser_id, endorsed_id)
);

create index if not exists coalition_endorsements_endorsed_id_idx
  on public.coalition_endorsements (endorsed_id);

comment on table public.coalition_endorsements is
  'Directed endorsements. endorser_id backs endorsed_id. The pair is unique.';

comment on column public.coalition_endorsements.endorser_id is
  'Candidate filing the endorsement.';

comment on column public.coalition_endorsements.endorsed_id is
  'Candidate receiving the endorsement.';

alter table public.coalition_endorsements enable row level security;

drop policy if exists coalition_endorsements_select_public on public.coalition_endorsements;
create policy coalition_endorsements_select_public
  on public.coalition_endorsements
  for select
  to anon, authenticated
  using (true);

drop policy if exists coalition_endorsements_insert_own on public.coalition_endorsements;
create policy coalition_endorsements_insert_own
  on public.coalition_endorsements
  for insert
  to authenticated
  with check (endorser_id = auth.uid());

drop policy if exists coalition_endorsements_delete_own on public.coalition_endorsements;
create policy coalition_endorsements_delete_own
  on public.coalition_endorsements
  for delete
  to authenticated
  using (endorser_id = auth.uid());

grant select on public.coalition_endorsements to anon, authenticated, service_role;
grant insert, delete on public.coalition_endorsements to authenticated, service_role;

-- Cosine distance (<=>) between two users' 6-axis ideology vectors.
-- Score is similarity as a percentage: 100 when the directions match, 0 at
-- orthogonal or opposed. Null when either coordinate is missing.
create or replace function public.calculate_user_compatibility(
  user_a uuid,
  user_b uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  vector_a vector(6);
  vector_b vector(6);
  distance double precision;
begin
  if user_a is null or user_b is null then
    return null;
  end if;

  select public.ideology_to_six_axis(u.ideology_vector)
    into vector_a
  from public.users u
  where u.id = user_a;

  if vector_a is null then
    select public.ideology_to_six_axis(c.ideology_vector)
      into vector_a
    from public.candidates c
    where c.id = user_a;
  end if;

  select public.ideology_to_six_axis(u.ideology_vector)
    into vector_b
  from public.users u
  where u.id = user_b;

  if vector_b is null then
    select public.ideology_to_six_axis(c.ideology_vector)
      into vector_b
    from public.candidates c
    where c.id = user_b;
  end if;

  if vector_a is null or vector_b is null then
    return null;
  end if;

  distance := vector_a <=> vector_b;

  if distance is null or distance = 'NaN'::double precision then
    return null;
  end if;

  return greatest(
    0,
    least(100, round((1 - distance) * 100)::integer)
  );
end;
$$;

comment on function public.calculate_user_compatibility(uuid, uuid) is
  'Ideological match percent (0–100) from pgvector cosine distance of the two users'' 6-axis ideology vectors.';

revoke all on function public.calculate_user_compatibility(uuid, uuid) from public;
grant execute on function public.calculate_user_compatibility(uuid, uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
