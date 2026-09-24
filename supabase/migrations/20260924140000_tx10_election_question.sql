-- One open candidate question on Texas's 10th so a profile that files
-- that district has a row the civic feed can render.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

do $$
declare
  v_district_id uuid := 'd1570001-0010-4000-8000-000000000010';
  v_election_id uuid := 'e1ec0001-0010-4000-8000-000000000010';
  v_prompt text := 'Should Congress raise the cap on the state and local tax deduction for households in Texas''s 10th Congressional District?';
  v_found uuid;
begin
  select e.id
    into v_found
  from public.elections e
  left join public.districts d on d.id = e.district_id
  where e.district_id = v_district_id
     or e.id = v_election_id
     or e.ocd_id = 'ocd-division/country:us/state:tx/cd:10'
     or e.slug = 'tx-us-house-10-2026'
     or d.name = 'U.S. House Texas District 10'
  order by
    case when e.district_id = v_district_id then 0 else 1 end,
    e.created_at
  limit 1;

  if v_found is null then
    insert into public.districts (
      id,
      name,
      level,
      pvi_score,
      historical_lean,
      median_ideology_vector,
      zip_code,
      state,
      updated_at
    )
    values (
      v_district_id,
      'U.S. House Texas District 10',
      'federal',
      13,
      'Solid Red',
      '[0.32,0.34,0.74,0.64,0.28,0.34,0.70,0.64,0.31,0.30]'::vector(10),
      '78602',
      'TX',
      timezone('utc'::text, now())
    )
    on conflict (id) do nothing;

    insert into public.elections (
      id,
      slug,
      office_name,
      median_voter_vector,
      incumbent_name,
      district_id,
      ocd_id,
      primary_rep_vector,
      primary_dem_vector,
      general_vector,
      pvi_score,
      updated_at
    )
    values (
      v_election_id,
      'tx-us-house-10-2026',
      'U.S. House Texas District 10',
      '[0.32,0.28,0.26,0.30,0.34,0.36]'::vector(6),
      'Michael McCaul',
      v_district_id,
      'ocd-division/country:us/state:tx/cd:10',
      '[0.10,0.12,0.08,0.10,0.14,0.16]'::vector(6),
      '[0.80,0.78,0.74,0.76,0.82,0.68]'::vector(6),
      '[0.32,0.28,0.26,0.30,0.34,0.36]'::vector(6),
      0.26,
      timezone('utc'::text, now())
    )
    on conflict (id) do nothing;

    v_found := v_election_id;
  end if;

  insert into public.election_questions (
    election_id,
    prompt,
    jurisdictional_level,
    primary_axis,
    applicable_ocd_ids,
    information_gain_score
  )
  select
    v_found,
    v_prompt,
    'federal',
    'economy',
    jsonb_build_array('ocd-division/country:us/state:tx/cd:10'),
    1
  where not exists (
    select 1
    from public.election_questions q
    where q.election_id = v_found
      and q.prompt = v_prompt
  );
end $$;

notify pgrst, 'reload schema';
