-- Phase 10: Electability Multiplier & Match Data
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

-- 1. Residency columns (no-op if Phase 9 already applied).
alter table public.users
  add column if not exists residency_state text,
  add column if not exists residency_zip text,
  add column if not exists is_eligible_federal boolean not null default true,
  add column if not exists is_eligible_local boolean not null default false;

-- 2. Geographic keys on districts so "My District" can filter by ZIP.
alter table public.districts
  add column if not exists zip_code text,
  add column if not exists state text;

comment on column public.districts.zip_code is
  'Representative ZIP used to match a user''s saved residency_zip.';
comment on column public.districts.state is
  'Two-letter state code for the seat.';

update public.districts
set zip_code = '78701', state = 'TX'
where name = 'Austin City Council - District 9'
  and (zip_code is null or state is null);

update public.districts
set zip_code = '78701', state = 'TX'
where name = 'Texas House District 47 (Suburban)'
  and (zip_code is null or state is null);

update public.districts
set zip_code = '78654', state = 'TX'
where name = 'Texas House District 19 (Rural/Exurban)'
  and (zip_code is null or state is null);

insert into public.districts (
  name,
  level,
  pvi_score,
  historical_lean,
  median_ideology_vector,
  zip_code,
  state
)
select
  'Texas 37th Congressional District',
  'federal',
  -24.0,
  'Solid Blue',
  '[0.85,0.75,0.25,0.2,0.8,0.85,0.2,0.25,0.7,0.75]'::vector(10),
  '78701',
  'TX'
where not exists (
  select 1
  from public.districts
  where name = 'Texas 37th Congressional District'
);

-- 3. Electability join table. Recreate the generated multiplier so it
--    includes legal_eligibility_integer as a hard 0/1.
create table if not exists public.electability_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  district_id uuid not null references public.districts(id) on delete cascade,
  ideological_match_pct numeric not null default 0
    check (ideological_match_pct >= 0 and ideological_match_pct <= 100),
  debate_win_rate numeric not null default 0
    check (debate_win_rate >= 0 and debate_win_rate <= 100),
  total_escrow_pledged numeric not null default 0
    check (total_escrow_pledged >= 0),
  legal_eligibility_integer smallint not null default 0
    check (legal_eligibility_integer in (0, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, district_id)
);

alter table public.electability_scores
  add column if not exists legal_eligibility_integer smallint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'electability_scores_legal_eligibility_integer_check'
  ) then
    alter table public.electability_scores
      add constraint electability_scores_legal_eligibility_integer_check
      check (legal_eligibility_integer in (0, 1));
  end if;
end
$$;

alter table public.electability_scores
  drop column if exists electability_multiplier;

alter table public.electability_scores
  add column electability_multiplier numeric generated always as (
    round(
      coalesce(ideological_match_pct, 0)
      * coalesce(nullif(debate_win_rate, 0), 1)
      * coalesce(nullif(total_escrow_pledged, 0), 1)
      * coalesce(legal_eligibility_integer, 0)::numeric
    , 4)
  ) stored;

create index if not exists electability_scores_user_id_idx
  on public.electability_scores (user_id);

create index if not exists electability_scores_district_id_idx
  on public.electability_scores (district_id);

create index if not exists electability_scores_multiplier_idx
  on public.electability_scores (electability_multiplier desc);

comment on table public.electability_scores is
  'Per-seat electability. Match is retained even when legal_eligibility_integer is 0.';

comment on column public.electability_scores.legal_eligibility_integer is
  '1 if the candidate passes the municipal ZIP residency check for this seat, else 0.';

comment on column public.electability_scores.electability_multiplier is
  'Product: ideological_match_pct * debate_win_rate * total_escrow_pledged * legal_eligibility_integer. Zero win rate or escrow is treated as 1 so a failed residency check is what zeros the score.';

create or replace function public.touch_electability_scores_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists electability_scores_set_updated_at on public.electability_scores;
create trigger electability_scores_set_updated_at
  before update on public.electability_scores
  for each row
  execute procedure public.touch_electability_scores_updated_at();

alter table public.electability_scores enable row level security;

drop policy if exists electability_scores_select_public on public.electability_scores;
create policy electability_scores_select_public
  on public.electability_scores
  for select
  to anon, authenticated
  using (true);

drop policy if exists electability_scores_insert_own on public.electability_scores;
create policy electability_scores_insert_own
  on public.electability_scores
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists electability_scores_update_own on public.electability_scores;
create policy electability_scores_update_own
  on public.electability_scores
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists electability_scores_delete_own on public.electability_scores;
create policy electability_scores_delete_own
  on public.electability_scores
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select on public.electability_scores to anon, authenticated, service_role;
grant insert, update, delete on public.electability_scores to authenticated, service_role;

-- 4. ZIP helper used by the municipal residency check.
create or replace function public.normalize_zip(value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select nullif(left(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g'), 5), '');
$$;

comment on function public.normalize_zip(text) is
  'Digits-only ZIP, truncated to 5 characters. Null when empty.';

revoke all on function public.normalize_zip(text) from public;
grant execute on function public.normalize_zip(text)
  to anon, authenticated, service_role;

-- 5. Electability multiplier for one candidate in one district.
--    Formula: match * win_rate * escrow * legal_eligibility_integer
--    legal_eligibility_integer is 0 unless the user's saved ZIP matches
--    the district (municipal residency). Ideological match is still stored.
create or replace function public.calculate_electability(
  p_user_id uuid,
  p_district_id uuid
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_district public.districts%rowtype;
  v_match numeric := 0;
  v_played numeric := 0;
  v_won numeric := 0;
  v_win_rate numeric := 0;
  v_escrow numeric := 0;
  v_eligibility smallint := 0;
  v_result numeric := 0;
begin
  if p_user_id is null or p_district_id is null then
    return 0;
  end if;

  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'Cannot calculate electability for another user';
  end if;

  select * into v_user
  from public.users
  where id = p_user_id;

  select * into v_district
  from public.districts
  where id = p_district_id;

  if v_user.id is null or v_district.id is null then
    return 0;
  end if;

  if v_user.ideology_vector is not null
     and v_district.median_ideology_vector is not null then
    v_match := round(
      (
        greatest(
          0::double precision,
          least(
            1::double precision,
            1 - (v_user.ideology_vector <=> v_district.median_ideology_vector)
          )
        ) * 100
      )::numeric,
      2
    );
  end if;

  select
    count(*)::numeric,
    count(*) filter (where winner_id = p_user_id)::numeric
  into v_played, v_won
  from (
    select public.calculate_debate_winner(d.id) as winner_id
    from public.debates d
    where d.status = 'completed'
      and p_user_id in (d.candidate_a_id, d.candidate_b_id)
  ) completed_debates;

  if v_played > 0 then
    v_win_rate := round((v_won / v_played) * 100, 1);
  else
    v_win_rate := 0;
  end if;

  select coalesce(sum(amount), 0)
  into v_escrow
  from public.pledges
  where candidate_id = p_user_id;

  -- Municipal residency: saved ZIP must match the seat's ZIP.
  if public.normalize_zip(v_user.residency_zip) is not null
     and public.normalize_zip(v_user.residency_zip)
       = public.normalize_zip(v_district.zip_code) then
    v_eligibility := 1;
  else
    v_eligibility := 0;
  end if;

  insert into public.electability_scores (
    user_id,
    district_id,
    ideological_match_pct,
    debate_win_rate,
    total_escrow_pledged,
    legal_eligibility_integer
  )
  values (
    p_user_id,
    p_district_id,
    v_match,
    v_win_rate,
    v_escrow,
    v_eligibility
  )
  on conflict (user_id, district_id) do update
  set
    ideological_match_pct = excluded.ideological_match_pct,
    debate_win_rate = excluded.debate_win_rate,
    total_escrow_pledged = excluded.total_escrow_pledged,
    legal_eligibility_integer = excluded.legal_eligibility_integer;

  select electability_multiplier
  into v_result
  from public.electability_scores
  where user_id = p_user_id
    and district_id = p_district_id;

  return coalesce(v_result, 0);
end;
$$;

comment on function public.calculate_electability(uuid, uuid) is
  'Upserts electability_scores for a user+district. Returns match * win_rate * escrow * legal_eligibility_integer. Eligibility is 0 unless municipal ZIP residency passes; ideological match is still stored.';

revoke all on function public.calculate_electability(uuid, uuid) from public;
grant execute on function public.calculate_electability(uuid, uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
