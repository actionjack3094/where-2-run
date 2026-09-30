-- Escrow release on a 10-debate alignment streak.
--
-- 1. calibrate_district_alignment now returns the streak it just wrote, one row
--    per campaign target it incremented, so callers can react when a candidate
--    reaches 10 without a second query. It returns no rows when the district is
--    ejected (similarity below 0.85), because no streak moved.
-- 2. campaign_pledges gains a `released` status: the alignment condition was met
--    and the funds are cleared for capture.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

drop function if exists public.calibrate_district_alignment(uuid, text);

create function public.calibrate_district_alignment(
  p_user_id uuid,
  p_district_id text
)
returns table (target_election_id uuid, new_streak integer)
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
    return query
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
      )
    returning ct.election_id, ct.alignment_streak;
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
  'Anchor: cosine similarity >= 0.85 increments campaign_targets.alignment_streak for that district and returns (target_election_id, new_streak) per target. Ejection: similarity < 0.85 drops the OCD-ID from matched_ocd_ids, appends the nearest other district centroid, and returns no rows.';

revoke all on function public.calibrate_district_alignment(uuid, text) from public;
grant execute on function public.calibrate_district_alignment(uuid, text)
  to authenticated, service_role;

-- `released` = the unlock condition was met; funds are cleared for capture.
do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.campaign_pledges'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.campaign_pledges drop constraint %I', rec.conname);
  end loop;
end
$$;

alter table public.campaign_pledges
  add constraint campaign_pledges_status_check
  check (status in ('pending', 'released', 'captured', 'failed', 'canceled'));

comment on column public.campaign_pledges.status is
  'pending = waiting on its unlock condition; released = condition met, cleared for capture; captured = charged; failed = off-session charge declined.';

notify pgrst, 'reload schema';
