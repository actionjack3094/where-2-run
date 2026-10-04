-- District Agenda seed: Texas Senate and Austin Mayor issues, plus a concluded
-- zoning debate so My Ballot can show a seated match for an Austin address.
--
-- Upvote totals are written onto community_prompts.upvote_count. The sync
-- trigger only runs when prompt_upvotes rows are inserted, so these demo
-- counts stay at the seeded values.

do $seed$
declare
  v_senate uuid;
  v_austin uuid;
  v_voter uuid;
  v_harlan uuid;
  v_vance uuid := 'b07a0001-0005-4000-8000-000000000005';
  v_filibuster uuid := 'c0mm0001-0001-4000-8000-000000000001';
  v_permitting uuid := 'c0mm0001-0002-4000-8000-000000000002';
  v_budget uuid := 'c0mm0001-0003-4000-8000-000000000003';
  v_zoning uuid := 'c0mm0001-0004-4000-8000-000000000004';
  v_prompt uuid := 'd3b70001-0005-4000-8000-000000000005';
  v_debate uuid := 'a4e40001-0005-4000-8000-000000000005';
  v_austin_ocd text := 'ocd-division/country:us/state:tx/place:austin';
  v_has_level boolean;
  v_stance_a text := 'Neighborhood associations should keep the last word on what gets built on their blocks. A state or federal override would wipe out Austin''s neighborhood plans, overload streets that were never built for mid-rise traffic, and hand developers a permit they did not have to earn locally. Density belongs where the city has already planned for it.';
  v_stance_b text := 'Austin''s zoning code is the housing crisis. Single-family vetoes have locked families out and pushed prices past what teachers and nurses can pay. The state should override exclusionary local rules and require high-density housing near transit, even when a neighborhood association objects. Waiting for unanimous local consent means the homes never get built.';
  v_zoning_title text := 'Zoning Preemption';
  v_zoning_body text := 'Austin''s housing crisis is driven by local zoning laws blocking density. Should the state or federal government explicitly override local Austin zoning laws to force the construction of high-density housing, even if local neighborhood associations oppose it?';
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'primaries'
      and column_name = 'level'
  ) into v_has_level;

  select id into v_senate
  from public.primaries
  where slug = 'tx-senate-dem'
  order by cycle_year desc nulls last
  limit 1;

  if v_senate is null then
    raise exception 'Texas Senate Democratic primary (slug tx-senate-dem) is missing. Apply the platform seed before this migration.';
  end if;

  select id into v_austin
  from public.primaries
  where party = 'democrat'
    and state = 'TX'
    and (
      slug = 'austin-mayor-dem'
      or (
        ocd_id = v_austin_ocd
        and (office_name ilike '%mayor%' or office_name ilike '%council%')
      )
    )
  order by (slug = 'austin-mayor-dem') desc, cycle_year desc nulls last
  limit 1;

  if v_austin is null then
    v_austin := 'b71a0001-0005-4000-8000-000000000005';
    insert into public.primaries (
      id,
      party,
      office_name,
      state,
      district,
      ocd_id,
      baseline_x,
      baseline_y,
      slug,
      general_slug,
      cycle_year,
      primary_date,
      general_election_date,
      term_length_years,
      senate_class,
      status
    )
    values (
      v_austin,
      'democrat',
      'Austin Mayor',
      'TX',
      null,
      v_austin_ocd,
      -0.42,
      -0.18,
      'austin-mayor-dem',
      'austin-mayor',
      2026,
      '2026-12-08T20:00:00Z',
      '2027-11-02T00:00:00Z',
      4,
      null,
      'active'
    );
  end if;

  if v_has_level then
    execute 'update public.primaries set level = ''local'' where id = $1'
      using v_austin;
  end if;

  -- Marcus Vance is not in the earlier bot roster. He is a verified Democratic
  -- synthetic so he can accept James Harlan's intra-party seat.
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    is_sso_user,
    is_anonymous
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_vance,
    'authenticated',
    'authenticated',
    'marcus.vance@seed.where2run.local',
    extensions.crypt('seed-local-dev', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Marcus Vance"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    v_vance,
    v_vance,
    jsonb_build_object('sub', v_vance::text, 'email', 'marcus.vance@seed.where2run.local'),
    'email',
    'marcus.vance@seed.where2run.local',
    now(),
    now(),
    now()
  )
  on conflict (id) do nothing;

  update public.profiles
  set synthetic_key = null, updated_at = now()
  where synthetic_key = 'marcus-vance'
    and id <> v_vance;

  insert into public.profiles (
    id,
    email,
    full_name,
    display_name,
    legal_name,
    ideology_x,
    ideology_y,
    onboarding_completed,
    is_verified,
    is_synthetic,
    synthetic_key,
    candidate_tier,
    updated_at
  )
  values (
    v_vance,
    'marcus.vance@seed.where2run.local',
    'Marcus Vance',
    'Marcus Vance',
    'Marcus Vance',
    -0.64,
    -0.42,
    true,
    true,
    true,
    'marcus-vance',
    'pundit',
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    display_name = excluded.display_name,
    legal_name = excluded.legal_name,
    ideology_x = excluded.ideology_x,
    ideology_y = excluded.ideology_y,
    onboarding_completed = true,
    is_verified = true,
    is_synthetic = true,
    synthetic_key = excluded.synthetic_key,
    updated_at = now();

  select id into v_harlan
  from public.profiles
  where id = 'b07a0001-0002-4000-8000-000000000002'
     or synthetic_key = 'blue-dog'
     or display_name = 'James Harlan'
     or full_name = 'James Harlan'
  order by (id = 'b07a0001-0002-4000-8000-000000000002') desc
  limit 1;

  if v_harlan is null then
    raise exception 'James Harlan is not seeded. Apply supabase/seed.sql before this migration.';
  end if;

  select p.id into v_voter
  from public.profiles p
  where p.id in (
      'a07e0001-0001-4000-8000-000000000001',
      'a07e0001-0003-4000-8000-000000000003'
    )
    or exists (
      select 1
      from public.users u
      where u.id = p.id
        and u.is_verified = true
        and u.verification_tier = 'voter_verified'
    )
  order by (p.id = 'a07e0001-0001-4000-8000-000000000001') desc
  limit 1;

  if v_voter is null then
    raise exception 'No verified seed voter is on profiles. Apply supabase/seed.sql before this migration.';
  end if;

  update public.profiles
  set is_verified = true, updated_at = now()
  where id = v_voter
    and is_verified = false;

  -- Austin seed voters need place:austin on the ballot fence so this match
  -- is visible when they open My Ballot.
  update public.profiles
  set ocd_ids = (
    select array(
      select distinct x
      from unnest(coalesce(ocd_ids, '{}'::text[]) || array[v_austin_ocd]::text[]) as x
    )
  )
  where id in (
    'a07e0001-0001-4000-8000-000000000001',
    'a07e0001-0003-4000-8000-000000000003',
    v_voter
  );

  update public.users
  set home_ocd_ids = (
    select array(
      select distinct x
      from unnest(coalesce(home_ocd_ids, '{}'::text[]) || array[v_austin_ocd]::text[]) as x
    )
  )
  where id in (
    'a07e0001-0001-4000-8000-000000000001',
    'a07e0001-0003-4000-8000-000000000003',
    v_voter
  );

  insert into public.community_prompts (id, primary_id, voter_id, title, content, upvote_count)
  values
    (
      v_filibuster,
      v_senate,
      v_voter,
      'The Filibuster & The Courts',
      'If Democrats take back the trifecta in 2028, should we abolish the filibuster to pass voting rights and expand the Supreme Court, or does that hand Republicans a weapon to dismantle the administrative state in the next cycle?',
      142
    ),
    (
      v_permitting,
      v_senate,
      v_voter,
      'Permitting Reform vs. Climate',
      'To build green infrastructure fast enough to hit climate goals, we have to bypass NEPA and local environmental reviews. Do we sacrifice local community input to build transmission lines at scale?',
      98
    ),
    (
      v_budget,
      v_austin,
      v_voter,
      'The $6.6B Budget & Property Taxes',
      'The city just passed a $6.6 billion budget that raises property taxes again, largely driven by police and fire overtime. Should we freeze the public safety budget to provide property tax relief, or is that a necessary cost for a growing city?',
      215
    ),
    (
      v_zoning,
      v_austin,
      v_voter,
      v_zoning_title,
      v_zoning_body,
      187
    )
  on conflict (id) do update
  set
    primary_id = excluded.primary_id,
    voter_id = excluded.voter_id,
    title = excluded.title,
    content = excluded.content,
    upvote_count = excluded.upvote_count;

  insert into public.debate_prompts (
    id,
    primary_id,
    author_id,
    author_kind,
    prompt_text,
    stance_text,
    ideology_x,
    ideology_y,
    status,
    source_prompt_id
  )
  values (
    v_prompt,
    v_austin,
    v_harlan,
    'ai',
    v_zoning_title || E'\n' || v_zoning_body,
    v_stance_a,
    -0.30,
    0.16,
    'concluded',
    v_zoning
  )
  on conflict (id) do update
  set
    primary_id = excluded.primary_id,
    author_id = excluded.author_id,
    author_kind = excluded.author_kind,
    prompt_text = excluded.prompt_text,
    stance_text = excluded.stance_text,
    ideology_x = excluded.ideology_x,
    ideology_y = excluded.ideology_y,
    status = 'concluded',
    source_prompt_id = excluded.source_prompt_id;

  insert into public.arena_debates (
    id,
    primary_id,
    prompt_id,
    candidate_a_id,
    candidate_b_id,
    stance_a,
    stance_b,
    seat_locked_until,
    status,
    winner_id,
    is_tie
  )
  values (
    v_debate,
    v_austin,
    v_prompt,
    v_harlan,
    v_vance,
    v_stance_a,
    v_stance_b,
    null,
    'concluded',
    v_harlan,
    false
  )
  on conflict (id) do update
  set
    primary_id = excluded.primary_id,
    prompt_id = excluded.prompt_id,
    candidate_a_id = excluded.candidate_a_id,
    candidate_b_id = excluded.candidate_b_id,
    stance_a = excluded.stance_a,
    stance_b = excluded.stance_b,
    seat_locked_until = null,
    status = 'concluded',
    winner_id = excluded.winner_id,
    is_tie = false,
    updated_at = now();
end
$seed$;

notify pgrst, 'reload schema';
