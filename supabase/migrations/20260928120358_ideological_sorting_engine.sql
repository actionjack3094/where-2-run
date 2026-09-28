-- Ideological sorting engine.
-- home_ocd_ids is the permanent physical ballot (Blue Cards).
-- matched_ocd_ids is the dynamically sorted ideological ballot (Red Cards).
-- campaign_targets carries the escrow pipeline: lock, streak, and pledged amount.
-- calibrate_district_alignment compares a user's ideology_vector to a district
-- centroid (median_ideology_vector) with pgvector cosine distance (<=>).

alter table public.users
  add column if not exists home_ocd_ids text[] not null default '{}'::text[],
  add column if not exists matched_ocd_ids text[] not null default '{}'::text[];

comment on column public.users.home_ocd_ids is
  'Permanent physical ballot OCD-IDs. Blue Cards.';

comment on column public.users.matched_ocd_ids is
  'Dynamically sorted ideological OCD-IDs. Red Cards. calibrate_district_alignment ejects a district below 0.85 cosine similarity and appends the nearest remaining centroid.';

create index if not exists users_home_ocd_ids_gin_idx
  on public.users using gin (home_ocd_ids);

create index if not exists users_matched_ocd_ids_gin_idx
  on public.users using gin (matched_ocd_ids);

alter table public.campaign_targets
  add column if not exists is_locked boolean not null default false,
  add column if not exists alignment_streak integer not null default 0,
  add column if not exists pledged_escrow numeric not null default 0.00;

comment on column public.campaign_targets.is_locked is
  'Escrow pipeline lock. True once the pledge is held for this target.';

comment on column public.campaign_targets.alignment_streak is
  'Consecutive calibrations where cosine similarity to this district stayed at or above 0.85.';

comment on column public.campaign_targets.pledged_escrow is
  'Dollars pledged into escrow for this campaign target.';

create or replace function public.calibrate_district_alignment(
  p_user_id uuid,
  p_district_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_vector vector(10);
  v_centroid vector(10);
  v_similarity double precision;
  v_replacement text;
begin
  if p_user_id is null or p_district_id is null or btrim(p_district_id) = '' then
    raise exception 'calibrate_district_alignment requires a user and a district';
  end if;

  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'Cannot calibrate alignment for another user';
  end if;

  select ideology_vector
    into v_user_vector
  from public.users
  where id = p_user_id;

  if not found then
    raise exception 'User % not found', p_user_id;
  end if;

  if v_user_vector is null then
    raise exception 'User % has no ideology vector', p_user_id;
  end if;

  select median_ideology_vector
    into v_centroid
  from public.districts
  where ocd_id = p_district_id
     or id::text = p_district_id
  order by case when ocd_id = p_district_id then 0 else 1 end
  limit 1;

  if v_centroid is null then
    raise exception 'District % has no centroid vector', p_district_id;
  end if;

  -- pgvector <=> is cosine distance. Similarity is 1 minus that distance.
  v_similarity := 1 - (v_centroid <=> v_user_vector);

  if v_similarity >= 0.85 then
    update public.campaign_targets as ct
    set alignment_streak = ct.alignment_streak + 1
    from public.elections as e
    left join public.districts as d on d.id = e.district_id
    where ct.user_id = p_user_id
      and ct.election_id = e.id
      and (
        e.ocd_id = p_district_id
        or d.ocd_id = p_district_id
        or d.id::text = p_district_id
      );
    return;
  end if;

  update public.users
  set matched_ocd_ids = array_remove(coalesce(matched_ocd_ids, '{}'::text[]), p_district_id)
  where id = p_user_id;

  -- Nearest remaining centroid. The ejected OCD-ID is excluded so the sort
  -- cannot write the same district straight back onto the Red Card.
  select d.ocd_id
    into v_replacement
  from public.districts as d
  where d.median_ideology_vector is not null
    and d.ocd_id is not null
    and d.ocd_id is distinct from p_district_id
  order by d.median_ideology_vector <=> v_user_vector
  limit 1;

  if v_replacement is null then
    return;
  end if;

  update public.users
  set matched_ocd_ids = case
    when v_replacement = any(coalesce(matched_ocd_ids, '{}'::text[]))
      then matched_ocd_ids
    else coalesce(matched_ocd_ids, '{}'::text[]) || v_replacement
  end
  where id = p_user_id;
end;
$$;

comment on function public.calibrate_district_alignment(uuid, text) is
  'Anchor: cosine similarity >= 0.85 increments campaign_targets.alignment_streak for that district. Ejection: similarity < 0.85 drops the OCD-ID from matched_ocd_ids and appends the nearest other district centroid.';

revoke all on function public.calibrate_district_alignment(uuid, text) from public;
grant execute on function public.calibrate_district_alignment(uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
