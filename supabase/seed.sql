-- Mock candidate tickets for local vector matching + civic fencing.
-- Applied automatically on `supabase db reset`. Safe to re-run: inserts are
-- keyed by stable UUIDs and use ON CONFLICT DO NOTHING / DO UPDATE.
--
-- ideology_vector axes (10), each in [-1.0, 1.0]:
--   1 labor_economics        + unions / worker power        − capital / management
--   2 market_efficiency      + price signals / deregulation − industrial policy
--   3 natural_rights         + individual liberty           − collective / statist
--   4 constitutional_history + original public meaning      − living constitution
--   5 fiscal_redistribution  + progressive tax-and-spend    − austerity
--   6 energy_transition      + public renewable build-out   − fossil expansion
--   7 immigration_openness   + pathway / expansion          − restriction
--   8 localism               + municipal control            − federal preemption
--   9 civic_equality         + expanded civil-rights law    − traditional defaults
--  10 public_order           + enforcement / order          − prevention / decarceral
--
-- public.candidates.id → public.users.id → auth.users.id, so auth + profile
-- rows are created first. Geographic fencing lives on users.ocd_identifiers.

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
values
  (
    '00000000-0000-0000-0000-000000000000',
    'c0a1d001-0001-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'maya.chen@seed.where2run.local',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Maya Chen"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0a1d001-0002-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'grant.holloway@seed.where2run.local',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Grant Holloway"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0a1d001-0003-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'elena.vasquez@seed.where2run.local',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Elena Vasquez"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0a1d001-0004-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'marcus.webb@seed.where2run.local',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Marcus Webb"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0a1d001-0005-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'priya.nair@seed.where2run.local',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Priya Nair"}'::jsonb,
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

insert into public.users (
  id,
  username,
  ideology_vector,
  residency_state,
  ocd_identifiers,
  tier_2_verified,
  is_verified,
  is_eligible_local,
  verification_tier,
  updated_at
)
values
  -- Austin City Council District 9. Closest match to the baseline test vector:
  -- labor-left, rights-forward, climate-first, decarceral.
  (
    'c0a1d001-0001-4000-8000-000000000001',
    'seed-maya-chen',
    '[0.55,-0.48,0.82,0.15,0.05,0.88,-0.35,0.32,0.62,-0.72]'::vector(10),
    'TX',
    array[
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/place:austin',
      'ocd-division/country:us/state:tx/place:austin/council_district:9'
    ]::text[],
    true,
    true,
    true,
    'candidate_verified',
    now()
  ),
  -- Austin City Council District 7. Market-liberal: opposite labor / efficiency.
  (
    'c0a1d001-0002-4000-8000-000000000002',
    'seed-grant-holloway',
    '[-0.70,0.85,0.60,0.45,-0.80,-0.20,0.25,0.40,0.10,0.15]'::vector(10),
    'TX',
    array[
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/place:austin',
      'ocd-division/country:us/state:tx/place:austin/council_district:7'
    ]::text[],
    true,
    true,
    true,
    'candidate_verified',
    now()
  ),
  -- Houston City Council District C. Social-democratic living-constitution.
  (
    'c0a1d001-0003-4000-8000-000000000003',
    'seed-elena-vasquez',
    '[0.90,-0.75,0.40,-0.65,0.85,0.70,0.80,0.20,0.90,-0.50]'::vector(10),
    'TX',
    array[
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/place:houston',
      'ocd-division/country:us/state:tx/place:houston/council_district:c'
    ]::text[],
    true,
    true,
    true,
    'candidate_verified',
    now()
  ),
  -- Dallas City Council District 14. Originalist conservative.
  (
    'c0a1d001-0004-4000-8000-000000000004',
    'seed-marcus-webb',
    '[-0.60,0.70,-0.30,0.90,-0.75,-0.85,-0.80,0.55,-0.70,0.85]'::vector(10),
    'TX',
    array[
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/place:dallas',
      'ocd-division/country:us/state:tx/place:dallas/council_district:14'
    ]::text[],
    true,
    true,
    true,
    'candidate_verified',
    now()
  ),
  -- Oakland City Council District 3. Libertarian: markets + natural rights.
  (
    'c0a1d001-0005-4000-8000-000000000005',
    'seed-priya-nair',
    '[-0.40,0.90,0.95,0.70,-0.55,0.10,0.50,0.80,0.20,-0.60]'::vector(10),
    'CA',
    array[
      'ocd-division/country:us/state:ca',
      'ocd-division/country:us/state:ca/place:oakland',
      'ocd-division/country:us/state:ca/place:oakland/council_district:3'
    ]::text[],
    true,
    true,
    true,
    'candidate_verified',
    now()
  )
on conflict (id) do update
set
  username = excluded.username,
  ideology_vector = excluded.ideology_vector,
  residency_state = excluded.residency_state,
  ocd_identifiers = excluded.ocd_identifiers,
  tier_2_verified = excluded.tier_2_verified,
  is_verified = excluded.is_verified,
  is_eligible_local = excluded.is_eligible_local,
  verification_tier = excluded.verification_tier,
  updated_at = now();

insert into public.candidates (
  id,
  display_name,
  office_sought,
  bio,
  residency_state,
  ideology_vector,
  pac_agreement_accepted,
  pac_agreement_accepted_at,
  updated_at
)
values
  (
    'c0a1d001-0001-4000-8000-000000000001',
    'Maya Chen',
    'City Council',
    'Labor organizer for Austin District 9. Worker power, climate build-out, and civil liberties.',
    'TX',
    '[0.55,-0.48,0.82,0.15,0.05,0.88,-0.35,0.32,0.62,-0.72]'::vector(10),
    true,
    now(),
    now()
  ),
  (
    'c0a1d001-0002-4000-8000-000000000002',
    'Grant Holloway',
    'City Council',
    'Market-liberal for Austin District 7. Price signals, light-touch regulation, local control.',
    'TX',
    '[-0.70,0.85,0.60,0.45,-0.80,-0.20,0.25,0.40,0.10,0.15]'::vector(10),
    true,
    now(),
    now()
  ),
  (
    'c0a1d001-0003-4000-8000-000000000003',
    'Elena Vasquez',
    'City Council',
    'Houston District C. Living-constitution progressive: unions, redistribution, open admissions.',
    'TX',
    '[0.90,-0.75,0.40,-0.65,0.85,0.70,0.80,0.20,0.90,-0.50]'::vector(10),
    true,
    now(),
    now()
  ),
  (
    'c0a1d001-0004-4000-8000-000000000004',
    'Marcus Webb',
    'City Council',
    'Dallas District 14. Original-meaning conservative: markets, historical constitution, public order.',
    'TX',
    '[-0.60,0.70,-0.30,0.90,-0.75,-0.85,-0.80,0.55,-0.70,0.85]'::vector(10),
    true,
    now(),
    now()
  ),
  (
    'c0a1d001-0005-4000-8000-000000000005',
    'Priya Nair',
    'City Council',
    'Oakland District 3. Libertarian ticket: natural rights, market efficiency, municipal home rule.',
    'CA',
    '[-0.40,0.90,0.95,0.70,-0.55,0.10,0.50,0.80,0.20,-0.60]'::vector(10),
    true,
    now(),
    now()
  )
on conflict (id) do update
set
  display_name = excluded.display_name,
  office_sought = excluded.office_sought,
  bio = excluded.bio,
  residency_state = excluded.residency_state,
  ideology_vector = excluded.ideology_vector,
  pac_agreement_accepted = excluded.pac_agreement_accepted,
  pac_agreement_accepted_at = excluded.pac_agreement_accepted_at,
  updated_at = now();

-- Closest ideological match to a baseline civic vector (cosine distance <=>).
-- Uncomment to run after seed. Smallest distance = nearest neighbor.
-- Expected: Maya Chen (Austin council_district:9).
--
-- select
--   c.display_name,
--   u.ocd_identifiers[cardinality(u.ocd_identifiers)] as local_district_id,
--   (c.ideology_vector <=> '[0.5,-0.5,0.8,0.2,-0.1,0.9,-0.4,0.3,0.6,-0.7]'::vector(10)) as cosine_distance
-- from public.candidates as c
-- join public.users as u on u.id = c.id
-- order by c.ideology_vector <=> '[0.5,-0.5,0.8,0.2,-0.1,0.9,-0.4,0.3,0.6,-0.7]'::vector(10)
-- limit 1;
