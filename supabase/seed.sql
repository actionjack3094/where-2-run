-- Local development seed. Applied automatically by `supabase db reset`.
-- Stable UUIDs and ON CONFLICT make the script safe to re-run.
--
-- Six civic axes, each in [0, 1]:
--   1 climate      fossil expansion        → public renewables
--   2 healthcare   private markets         → single-payer
--   3 immigration  restriction             → pathway / expansion
--   4 economy      tax cuts / deregulation → labor & progressive tax
--   5 social       traditional defaults    → codified civil rights
--   6 safety       zero-tolerance patrol   → prevention / responders
--
-- public.candidates.ideology_vector and public.users.ideology_vector are
-- vector(10). Each row stores the onboarding expansion of that 6-axis quiz
-- (buildUserVector): climate, social, 1-immigration, 1-safety, healthcare,
-- social, 1-economy, 1-safety, (climate+economy)/2, economy.
-- public.elections.median_voter_vector stays vector(6).
--
-- Dev sign-in for any seeded account: password `seed-local-dev`.

-- Drop the congressional district the electability migration inserts under a
-- random id, so the canonical House seat below is the only TX-37 row.
delete from public.elections e
using public.districts d
where e.district_id = d.id
  and d.name = 'Texas 37th Congressional District'
  and d.id <> 'd1570001-0037-4000-8000-000000000037';

delete from public.districts
where name = 'Texas 37th Congressional District'
  and id <> 'd1570001-0037-4000-8000-000000000037';

delete from public.elections
where slug in (
  'tx-us-house-37-2026',
  'tx-state-senate-14-2026',
  'tx-austin-city-council-d9-2026'
);

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
values
  (
    'd1570001-0037-4000-8000-000000000037',
    'U.S. House Texas District 37',
    'federal',
    -18,
    'Solid Blue',
    '[0.72,0.75,0.36,0.45,0.68,0.75,0.30,0.45,0.71,0.70]'::vector(10),
    '78701',
    'TX',
    now()
  ),
  (
    'd1570001-0014-4000-8000-000000000014',
    'Texas State Senate District 14',
    'state',
    -22,
    'Solid Blue',
    '[0.70,0.73,0.40,0.48,0.66,0.73,0.32,0.48,0.69,0.68]'::vector(10),
    '78703',
    'TX',
    now()
  ),
  (
    'd1570001-0009-4000-8000-000000000009',
    'Austin City Council - District 9',
    'local',
    -15,
    'Solid Blue',
    '[0.80,0.82,0.42,0.34,0.69,0.82,0.26,0.34,0.77,0.74]'::vector(10),
    '78704',
    'TX',
    now()
  )
on conflict (id) do update
set
  name = excluded.name,
  level = excluded.level,
  pvi_score = excluded.pvi_score,
  historical_lean = excluded.historical_lean,
  median_ideology_vector = excluded.median_ideology_vector,
  zip_code = excluded.zip_code,
  state = excluded.state,
  updated_at = now();

insert into public.elections (
  id,
  slug,
  office_name,
  median_voter_vector,
  incumbent_name,
  filing_requirements,
  district_id,
  ocd_id,
  updated_at
)
values
  (
    'e1ec0001-0037-4000-8000-000000000037',
    'tx-us-house-37-2026',
    'U.S. House Texas District 37',
    '[0.72,0.68,0.64,0.70,0.75,0.55]'::vector(6),
    'Lloyd Doggett',
    jsonb_build_object(
      'jurisdiction', 'Texas 37th Congressional District',
      'office', 'U.S. House Texas District 37',
      'level', 'federal',
      'state', 'TX',
      'ocd_id', 'ocd-division/country:us/state:tx/cd:37',
      'filing_deadline', '2026-12-14',
      'residency_deadline', '2026-11-03',
      'residency', 'Must be an inhabitant of Texas when elected. U.S. citizen, at least 25 years old, and seven years a citizen.',
      'petition_signatures', 500,
      'filing_fee', '$3,125 statutory filing fee, or a nominating petition in lieu',
      'ballot_access', jsonb_build_array(
        'Confirm age, citizenship, and state inhabitancy for the U.S. House.',
        'File a Statement of Organization (FEC Form 1) before accepting contributions.',
        'File the application for a place on the ballot with the Texas Secretary of State by the federal deadline.',
        'Pay the filing fee or submit a valid petition in lieu.',
        'File FEC reports on the congressional calendar once the committee is organized.'
      ),
      'treasurer', jsonb_build_object(
        'form', 'FEC Form 1',
        'office', 'Federal Election Commission',
        'notes', 'A principal campaign committee must file Form 1 before it accepts contributions or makes expenditures.',
        'steps', jsonb_build_array(
          'Designate a campaign treasurer and a committee depository.',
          'Complete FEC Form 1 with the candidate, treasurer, and bank.',
          'File the original with the Federal Election Commission.',
          'File an amended Form 1 before changing treasurer or bank.',
          'Do not accept contributions until the statement is on file.'
        )
      )
    ),
    'd1570001-0037-4000-8000-000000000037',
    'ocd-division/country:us/state:tx/cd:37',
    now()
  ),
  (
    'e1ec0001-0014-4000-8000-000000000014',
    'tx-state-senate-14-2026',
    'Texas State Senate District 14',
    '[0.70,0.66,0.60,0.68,0.73,0.52]'::vector(6),
    'Sarah Eckhardt',
    jsonb_build_object(
      'jurisdiction', 'Texas State Senate District 14',
      'office', 'Texas State Senate District 14',
      'level', 'state',
      'state', 'TX',
      'ocd_id', 'ocd-division/country:us/state:tx/sldu:14',
      'filing_deadline', '2026-12-14',
      'residency_deadline', '2026-11-03',
      'residency', 'Must have been a resident of Texas for 5 years and of District 14 for 12 months before election day. At least 26 years old.',
      'petition_signatures', 500,
      'filing_fee', '$1,250 statutory filing fee, or a petition in lieu',
      'ballot_access', jsonb_build_array(
        'Confirm the age and district residency tests for the Texas Senate.',
        'Appoint a campaign treasurer (Form CTA) before accepting contributions.',
        'File an application for a place on the ballot with the Texas Secretary of State.',
        'Pay the filing fee or submit a valid nominating petition in lieu.',
        'Keep Texas Ethics Commission reports current through the calendar.'
      ),
      'treasurer', jsonb_build_object(
        'form', 'Form CTA',
        'office', 'Texas Ethics Commission',
        'notes', 'Texas Election Code ch. 252. A candidate may not accept political contributions until the treasurer appointment is filed.',
        'steps', jsonb_build_array(
          'Choose a campaign treasurer who will sign finance reports.',
          'Complete Form CTA for Texas State Senate District 14.',
          'Candidate and treasurer both sign.',
          'File the original with the Texas Ethics Commission.',
          'File Form ACTA before replacing a treasurer.'
        )
      )
    ),
    'd1570001-0014-4000-8000-000000000014',
    'ocd-division/country:us/state:tx/sldu:14',
    now()
  ),
  (
    'e1ec0001-0009-4000-8000-000000000009',
    'tx-austin-city-council-d9-2026',
    'Austin City Council District 9',
    '[0.80,0.69,0.58,0.74,0.82,0.66]'::vector(6),
    'Zohaib Qadri',
    jsonb_build_object(
      'jurisdiction', 'Austin, Texas',
      'office', 'City Council District 9',
      'level', 'local',
      'state', 'TX',
      'ocd_id', 'ocd-division/country:us/state:tx/place:austin/council_district:9',
      'filing_deadline', '2026-08-17',
      'residency_deadline', '2026-05-01',
      'residency', 'Must reside in Austin City Council District 9 and be a qualified voter of the city.',
      'petition_signatures', 25,
      'filing_fee', 'Filing fee set by ordinance, or a nominating petition in lieu',
      'ballot_access', jsonb_build_array(
        'Be a U.S. citizen, 18 or older, and a qualified voter of the City of Austin.',
        'Reside in Council District 9 when filing and through the term.',
        'File an Application for a Place on the Ballot with the City Clerk.',
        'Pay the filing fee or submit a nominating petition of registered voters in the district.',
        'Keep a campaign treasurer appointment on file before accepting any contribution.'
      ),
      'treasurer', jsonb_build_object(
        'form', 'Form CTA (Appointment of a Campaign Treasurer by a Candidate)',
        'office', 'Texas Ethics Commission, with a copy to the Austin City Clerk',
        'notes', 'Texas Election Code ch. 252. Do not accept contributions until the treasurer appointment is filed.',
        'steps', jsonb_build_array(
          'Select a campaign treasurer.',
          'Complete Form CTA for Austin City Council District 9.',
          'Candidate and treasurer both sign.',
          'File the original with the Texas Ethics Commission and a copy with the Austin City Clerk.',
          'File Form ACTA before replacing a treasurer.'
        )
      )
    ),
    'd1570001-0009-4000-8000-000000000009',
    'ocd-division/country:us/state:tx/place:austin/council_district:9',
    now()
  )
on conflict (id) do update
set
  slug = excluded.slug,
  office_name = excluded.office_name,
  median_voter_vector = excluded.median_voter_vector,
  incumbent_name = excluded.incumbent_name,
  filing_requirements = excluded.filing_requirements,
  district_id = excluded.district_id,
  ocd_id = excluded.ocd_id,
  updated_at = now();

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
    extensions.crypt('seed-local-dev', extensions.gen_salt('bf')),
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
    extensions.crypt('seed-local-dev', extensions.gen_salt('bf')),
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
    extensions.crypt('seed-local-dev', extensions.gen_salt('bf')),
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
    extensions.crypt('seed-local-dev', extensions.gen_salt('bf')),
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
    extensions.crypt('seed-local-dev', extensions.gen_salt('bf')),
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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a07e0001-0001-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'jordan.hale@seed.where2run.local',
    extensions.crypt('seed-local-dev', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Jordan Hale"}'::jsonb,
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
    'a07e0001-0002-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'sam.okonkwo@seed.where2run.local',
    extensions.crypt('seed-local-dev', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sam Okonkwo"}'::jsonb,
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
    'a07e0001-0003-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'riley.cho@seed.where2run.local',
    extensions.crypt('seed-local-dev', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Riley Cho"}'::jsonb,
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
values
  (
    'c0a1d001-0001-4000-8000-000000000001',
    'c0a1d001-0001-4000-8000-000000000001',
    '{"sub":"c0a1d001-0001-4000-8000-000000000001","email":"maya.chen@seed.where2run.local"}'::jsonb,
    'email',
    'maya.chen@seed.where2run.local',
    now(),
    now(),
    now()
  ),
  (
    'c0a1d001-0002-4000-8000-000000000002',
    'c0a1d001-0002-4000-8000-000000000002',
    '{"sub":"c0a1d001-0002-4000-8000-000000000002","email":"grant.holloway@seed.where2run.local"}'::jsonb,
    'email',
    'grant.holloway@seed.where2run.local',
    now(),
    now(),
    now()
  ),
  (
    'c0a1d001-0003-4000-8000-000000000003',
    'c0a1d001-0003-4000-8000-000000000003',
    '{"sub":"c0a1d001-0003-4000-8000-000000000003","email":"elena.vasquez@seed.where2run.local"}'::jsonb,
    'email',
    'elena.vasquez@seed.where2run.local',
    now(),
    now(),
    now()
  ),
  (
    'c0a1d001-0004-4000-8000-000000000004',
    'c0a1d001-0004-4000-8000-000000000004',
    '{"sub":"c0a1d001-0004-4000-8000-000000000004","email":"marcus.webb@seed.where2run.local"}'::jsonb,
    'email',
    'marcus.webb@seed.where2run.local',
    now(),
    now(),
    now()
  ),
  (
    'c0a1d001-0005-4000-8000-000000000005',
    'c0a1d001-0005-4000-8000-000000000005',
    '{"sub":"c0a1d001-0005-4000-8000-000000000005","email":"priya.nair@seed.where2run.local"}'::jsonb,
    'email',
    'priya.nair@seed.where2run.local',
    now(),
    now(),
    now()
  ),
  (
    'a07e0001-0001-4000-8000-000000000001',
    'a07e0001-0001-4000-8000-000000000001',
    '{"sub":"a07e0001-0001-4000-8000-000000000001","email":"jordan.hale@seed.where2run.local"}'::jsonb,
    'email',
    'jordan.hale@seed.where2run.local',
    now(),
    now(),
    now()
  ),
  (
    'a07e0001-0002-4000-8000-000000000002',
    'a07e0001-0002-4000-8000-000000000002',
    '{"sub":"a07e0001-0002-4000-8000-000000000002","email":"sam.okonkwo@seed.where2run.local"}'::jsonb,
    'email',
    'sam.okonkwo@seed.where2run.local',
    now(),
    now(),
    now()
  ),
  (
    'a07e0001-0003-4000-8000-000000000003',
    'a07e0001-0003-4000-8000-000000000003',
    '{"sub":"a07e0001-0003-4000-8000-000000000003","email":"riley.cho@seed.where2run.local"}'::jsonb,
    'email',
    'riley.cho@seed.where2run.local',
    now(),
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.users (
  id,
  username,
  ideology_vector,
  target_district_id,
  residency_state,
  residency_zip,
  ocd_identifiers,
  tier_2_verified,
  is_verified,
  is_eligible_federal,
  is_eligible_local,
  verification_tier,
  elo_rating,
  updated_at
)
values
  -- 6-axis [0.84, 0.71, 0.62, 0.79, 0.81, 0.73]. Austin City Council D9.
  (
    'c0a1d001-0001-4000-8000-000000000001',
    'seed-maya-chen',
    '[0.84,0.81,0.38,0.27,0.71,0.81,0.21,0.27,0.815,0.79]'::vector(10),
    'd1570001-0009-4000-8000-000000000009',
    'TX',
    '78704',
    array[
      'ocd-division/country:us',
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/place:austin',
      'ocd-division/country:us/state:tx/place:austin/council_district:9'
    ]::text[],
    true,
    true,
    true,
    true,
    'candidate_verified',
    1512,
    now()
  ),
  -- 6-axis [0.28, 0.22, 0.55, 0.18, 0.48, 0.31]. Same council seat, market-liberal.
  (
    'c0a1d001-0002-4000-8000-000000000002',
    'seed-grant-holloway',
    '[0.28,0.48,0.45,0.69,0.22,0.48,0.82,0.69,0.23,0.18]'::vector(10),
    'd1570001-0009-4000-8000-000000000009',
    'TX',
    '78704',
    array[
      'ocd-division/country:us',
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/place:austin',
      'ocd-division/country:us/state:tx/place:austin/council_district:9'
    ]::text[],
    true,
    true,
    true,
    true,
    'candidate_verified',
    1284,
    now()
  ),
  -- 6-axis [0.76, 0.88, 0.81, 0.91, 0.86, 0.69]. Texas Senate 14.
  (
    'c0a1d001-0003-4000-8000-000000000003',
    'seed-elena-vasquez',
    '[0.76,0.86,0.19,0.31,0.88,0.86,0.09,0.31,0.835,0.91]'::vector(10),
    'd1570001-0014-4000-8000-000000000014',
    'TX',
    '78703',
    array[
      'ocd-division/country:us',
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/sldu:14'
    ]::text[],
    true,
    true,
    true,
    false,
    'candidate_verified',
    1640,
    now()
  ),
  -- 6-axis [0.18, 0.24, 0.15, 0.21, 0.16, 0.12]. Same senate seat, restrictionist.
  (
    'c0a1d001-0004-4000-8000-000000000004',
    'seed-marcus-webb',
    '[0.18,0.16,0.85,0.88,0.24,0.16,0.79,0.88,0.195,0.21]'::vector(10),
    'd1570001-0014-4000-8000-000000000014',
    'TX',
    '78703',
    array[
      'ocd-division/country:us',
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/sldu:14'
    ]::text[],
    true,
    true,
    true,
    false,
    'candidate_verified',
    1435,
    now()
  ),
  -- 6-axis [0.47, 0.19, 0.72, 0.14, 0.66, 0.78]. U.S. House TX-37.
  (
    'c0a1d001-0005-4000-8000-000000000005',
    'seed-priya-nair',
    '[0.47,0.66,0.28,0.22,0.19,0.66,0.86,0.22,0.305,0.14]'::vector(10),
    'd1570001-0037-4000-8000-000000000037',
    'TX',
    '78701',
    array[
      'ocd-division/country:us',
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/cd:37'
    ]::text[],
    true,
    true,
    true,
    false,
    'candidate_verified',
    1368,
    now()
  ),
  (
    'a07e0001-0001-4000-8000-000000000001',
    'seed-jordan-hale',
    null,
    null,
    'TX',
    '78704',
    array[
      'ocd-division/country:us',
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/place:austin',
      'ocd-division/country:us/state:tx/place:austin/council_district:9'
    ]::text[],
    true,
    true,
    true,
    true,
    'voter_verified',
    1200,
    now()
  ),
  (
    'a07e0001-0002-4000-8000-000000000002',
    'seed-sam-okonkwo',
    null,
    null,
    'TX',
    '78703',
    array[
      'ocd-division/country:us',
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/sldu:14'
    ]::text[],
    true,
    true,
    true,
    false,
    'voter_verified',
    1200,
    now()
  ),
  (
    'a07e0001-0003-4000-8000-000000000003',
    'seed-riley-cho',
    null,
    null,
    'TX',
    '78704',
    array[
      'ocd-division/country:us',
      'ocd-division/country:us/state:tx',
      'ocd-division/country:us/state:tx/place:austin',
      'ocd-division/country:us/state:tx/place:austin/council_district:9'
    ]::text[],
    true,
    true,
    true,
    true,
    'voter_verified',
    1200,
    now()
  )
on conflict (id) do update
set
  username = excluded.username,
  ideology_vector = excluded.ideology_vector,
  target_district_id = excluded.target_district_id,
  residency_state = excluded.residency_state,
  residency_zip = excluded.residency_zip,
  ocd_identifiers = excluded.ocd_identifiers,
  tier_2_verified = excluded.tier_2_verified,
  is_verified = excluded.is_verified,
  is_eligible_federal = excluded.is_eligible_federal,
  is_eligible_local = excluded.is_eligible_local,
  verification_tier = excluded.verification_tier,
  elo_rating = excluded.elo_rating,
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
  onboarding_completed,
  updated_at
)
values
  (
    'c0a1d001-0001-4000-8000-000000000001',
    'Maya Chen',
    'Austin City Council District 9',
    'Labor organizer for Austin District 9. Public renewables, stronger unions, and a shift from patrol to responders.',
    'TX',
    '[0.84,0.81,0.38,0.27,0.71,0.81,0.21,0.27,0.815,0.79]'::vector(10),
    true,
    now(),
    true,
    now()
  ),
  (
    'c0a1d001-0002-4000-8000-000000000002',
    'Grant Holloway',
    'Austin City Council District 9',
    'Market-liberal for Austin District 9. Price signals, a lighter city code, and private health coverage.',
    'TX',
    '[0.28,0.48,0.45,0.69,0.22,0.48,0.82,0.69,0.23,0.18]'::vector(10),
    true,
    now(),
    true,
    now()
  ),
  (
    'c0a1d001-0003-4000-8000-000000000003',
    'Elena Vasquez',
    'Texas State Senate District 14',
    'Social democrat for Senate District 14. Single-payer, school finance, and a broad pathway to citizenship.',
    'TX',
    '[0.76,0.86,0.19,0.31,0.88,0.86,0.09,0.31,0.835,0.91]'::vector(10),
    true,
    now(),
    true,
    now()
  ),
  (
    'c0a1d001-0004-4000-8000-000000000004',
    'Marcus Webb',
    'Texas State Senate District 14',
    'Restrictionist for Senate District 14. Tax cuts, traditional defaults, and zero-tolerance enforcement.',
    'TX',
    '[0.18,0.16,0.85,0.88,0.24,0.16,0.79,0.88,0.195,0.21]'::vector(10),
    true,
    now(),
    true,
    now()
  ),
  (
    'c0a1d001-0005-4000-8000-000000000005',
    'Priya Nair',
    'U.S. House Texas District 37',
    'Libertarian for Texas 37. Open admissions, low taxes, civil liberties, and prevention over patrol.',
    'TX',
    '[0.47,0.66,0.28,0.22,0.19,0.66,0.86,0.22,0.305,0.14]'::vector(10),
    true,
    now(),
    true,
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
  onboarding_completed = excluded.onboarding_completed,
  updated_at = now();

insert into public.debates (
  id,
  district_id,
  election_id,
  topic,
  candidate_a_id,
  candidate_b_id,
  status,
  current_round,
  expires_at
)
values
  (
    'deba0001-0001-4000-8000-000000000001',
    'd1570001-0009-4000-8000-000000000009',
    'e1ec0001-0009-4000-8000-000000000009',
    'Should Austin upzone District 9 corridors and fund the I-35 cap with a public bond?',
    'c0a1d001-0001-4000-8000-000000000001',
    'c0a1d001-0002-4000-8000-000000000002',
    'active',
    2,
    now() + interval '5 days'
  ),
  (
    'deba0001-0002-4000-8000-000000000002',
    'd1570001-0009-4000-8000-000000000009',
    'e1ec0001-0009-4000-8000-000000000009',
    'Should District 9 shift police overtime into mental-health response teams?',
    'c0a1d001-0001-4000-8000-000000000001',
    'c0a1d001-0002-4000-8000-000000000002',
    'active',
    2,
    now() + interval '5 days'
  ),
  (
    'deba0001-0003-4000-8000-000000000003',
    'd1570001-0014-4000-8000-000000000014',
    'e1ec0001-0014-4000-8000-000000000014',
    'Should Texas raise the basic allotment and recapture less from Austin ISD?',
    'c0a1d001-0003-4000-8000-000000000003',
    'c0a1d001-0004-4000-8000-000000000004',
    'active',
    2,
    now() + interval '5 days'
  ),
  (
    'deba0001-0004-4000-8000-000000000004',
    'd1570001-0037-4000-8000-000000000037',
    'e1ec0001-0037-4000-8000-000000000037',
    'Should Congress speed interstate transmission lines across the Texas grid?',
    'c0a1d001-0005-4000-8000-000000000005',
    null,
    'matching',
    1,
    now() + interval '5 days'
  )
on conflict (id) do update
set
  district_id = excluded.district_id,
  election_id = excluded.election_id,
  topic = excluded.topic,
  candidate_a_id = excluded.candidate_a_id,
  candidate_b_id = excluded.candidate_b_id,
  status = excluded.status,
  current_round = excluded.current_round,
  expires_at = excluded.expires_at;

alter table public.arguments disable trigger grade_debate_on_argument_insert;

insert into public.arguments (
  id,
  debate_id,
  author_id,
  round_number,
  content,
  consistency_score,
  consistency_critique,
  graded_at
)
values
  (
    'a4960001-0001-4000-8000-000000000001',
    'deba0001-0001-4000-8000-000000000001',
    'c0a1d001-0001-4000-8000-000000000001',
    1,
    'District 9 is short on homes people who work here can afford. I would upzone the corridors along Airport, Lamar, and Riverside, and pair that with a bond for the I-35 cap so the deck is a park and not a private podium. The bond is a public build, paid back by the tax base the new homes create. Leaving the code frozen just bids up the houses that already exist.',
    86,
    'Stays on housing supply and the public cap. Does not wander into unrelated axes.',
    now()
  ),
  (
    'a4960001-0002-4000-8000-000000000002',
    'deba0001-0001-4000-8000-000000000001',
    'c0a1d001-0002-4000-8000-000000000002',
    1,
    'The corridor upzone is the right deregulation. A new city bond is not. Austin already carries transportation debt, and a cap deck does not need a public developer. Let the code allow more homes by right, skip the bond, and leave the cap to whatever private capital will actually finance. Price signals will fill the lots faster than another election.',
    81,
    'Agrees on upzoning and rejects the bond. Consistent market-liberal line.',
    now()
  ),
  (
    'a4960001-0003-4000-8000-000000000003',
    'deba0001-0002-4000-8000-000000000002',
    'c0a1d001-0001-4000-8000-000000000001',
    1,
    'Most overtime calls in District 9 are welfare checks and people in crisis, not pursuits. I would move a defined slice of APD overtime into 24-hour clinician teams that answer those calls without a badge. Patrol stays for violence. The metric is fewer armed responses to medical emergencies, not a smaller force on paper.',
    88,
    'Draws a concrete line between crisis response and patrol.',
    now()
  ),
  (
    'a4960001-0004-4000-8000-000000000004',
    'deba0001-0002-4000-8000-000000000002',
    'c0a1d001-0002-4000-8000-000000000002',
    1,
    'Clinicians are useful as a contract, not as a raid on patrol overtime. Response times downtown are already the complaint I hear. Keep the overtime budget, hire the clinicians on top with a capped contract, and publish the time-to-scene numbers. Shifting the existing pot just makes the next violent call wait.',
    79,
    'Rejects the shift and offers an additive contract. On topic.',
    now()
  ),
  (
    'a4960001-0005-4000-8000-000000000005',
    'deba0001-0003-4000-8000-000000000003',
    'c0a1d001-0003-4000-8000-000000000003',
    1,
    'Austin ISD sends recapture dollars out of District 14 while its own campuses cut librarians. I would raise the basic allotment, lower the recapture rate on the first band of Austin wealth, and tie the new dollars to teacher pay and special education, not administration. The current formula punishes the district for the property values its own residents already pay tax on.',
    90,
    'Specific on allotment and recapture. Matches a progressive school-finance case.',
    now()
  ),
  (
    'a4960001-0006-4000-8000-000000000006',
    'deba0001-0003-4000-8000-000000000003',
    'c0a1d001-0004-4000-8000-000000000004',
    1,
    'Raising the allotment is a statewide tax hike dressed up as an Austin problem. Recapture is how rural schools get funded. I would freeze the basic allotment, keep recapture, and require Austin ISD to publish a campus-level budget before it asks the Legislature for more. Local waste is not a reason to rewrite the finance system.',
    84,
    'Opposes the allotment increase and defends recapture. Internally consistent.',
    now()
  ),
  (
    'a4960001-0007-4000-8000-000000000007',
    'deba0001-0004-4000-8000-000000000004',
    'c0a1d001-0005-4000-8000-000000000005',
    1,
    'ERCOT does not need a new federal builder. It needs permission to connect lines that investors will already pay for. I would cut the federal permitting clock on interstate transmission to eighteen months, keep eminent domain narrow, and block any public renewable mandate attached to the permit. Faster lines, private capital, no new subsidy.',
    83,
    'Permitting reform without a public build-out. Matches a libertarian grid argument.',
    now()
  )
on conflict (id) do update
set
  debate_id = excluded.debate_id,
  author_id = excluded.author_id,
  round_number = excluded.round_number,
  content = excluded.content,
  consistency_score = excluded.consistency_score,
  consistency_critique = excluded.consistency_critique,
  graded_at = excluded.graded_at;

alter table public.arguments enable trigger grade_debate_on_argument_insert;

-- Vaulted cards on the race. status stays 'vaulted' so nothing is captured.
insert into public.escrow_pledges (
  id,
  voter_id,
  election_id,
  pledged_amount,
  stripe_setup_intent_id,
  stripe_customer_id,
  stripe_payment_method_id,
  status,
  mandate_accepted_at
)
values
  (
    'e5c00001-0001-4000-8000-000000000001',
    'a07e0001-0001-4000-8000-000000000001',
    'e1ec0001-0009-4000-8000-000000000009',
    500,
    'seti_seed_escrow_d9_jordan',
    'cus_seed_jordan',
    'pm_seed_jordan',
    'vaulted',
    now()
  ),
  (
    'e5c00001-0002-4000-8000-000000000002',
    'a07e0001-0003-4000-8000-000000000003',
    'e1ec0001-0009-4000-8000-000000000009',
    150,
    'seti_seed_escrow_d9_riley',
    'cus_seed_riley',
    'pm_seed_riley',
    'vaulted',
    now()
  ),
  (
    'e5c00001-0003-4000-8000-000000000003',
    'a07e0001-0002-4000-8000-000000000002',
    'e1ec0001-0014-4000-8000-000000000014',
    1000,
    'seti_seed_escrow_sd14_sam',
    'cus_seed_sam',
    'pm_seed_sam',
    'vaulted',
    now()
  ),
  (
    'e5c00001-0004-4000-8000-000000000004',
    'a07e0001-0001-4000-8000-000000000001',
    'e1ec0001-0037-4000-8000-000000000037',
    750,
    'seti_seed_escrow_tx37_jordan',
    'cus_seed_jordan',
    'pm_seed_jordan',
    'vaulted',
    now()
  )
on conflict (id) do update
set
  voter_id = excluded.voter_id,
  election_id = excluded.election_id,
  pledged_amount = excluded.pledged_amount,
  stripe_setup_intent_id = excluded.stripe_setup_intent_id,
  stripe_customer_id = excluded.stripe_customer_id,
  stripe_payment_method_id = excluded.stripe_payment_method_id,
  status = excluded.status,
  mandate_accepted_at = excluded.mandate_accepted_at,
  updated_at = now();

-- Campaign Hub reads pending campaign_pledges (candidate-scoped), not escrow_pledges.
insert into public.campaign_pledges (
  id,
  donor_id,
  candidate_id,
  election_id,
  amount,
  unlock_condition,
  debate_id,
  stripe_customer_id,
  stripe_payment_method_id,
  stripe_setup_intent_id,
  status
)
values
  (
    'c4a90001-0001-4000-8000-000000000001',
    'a07e0001-0001-4000-8000-000000000001',
    'c0a1d001-0001-4000-8000-000000000001',
    'e1ec0001-0009-4000-8000-000000000009',
    500,
    'ballot_access_filed',
    'deba0001-0001-4000-8000-000000000001',
    'cus_seed_jordan',
    'pm_seed_jordan',
    'seti_seed_campaign_maya_jordan',
    'pending'
  ),
  (
    'c4a90001-0002-4000-8000-000000000002',
    'a07e0001-0003-4000-8000-000000000003',
    'c0a1d001-0002-4000-8000-000000000002',
    'e1ec0001-0009-4000-8000-000000000009',
    150,
    'candidate_declares',
    'deba0001-0002-4000-8000-000000000002',
    'cus_seed_riley',
    'pm_seed_riley',
    'seti_seed_campaign_grant_riley',
    'pending'
  ),
  (
    'c4a90001-0003-4000-8000-000000000003',
    'a07e0001-0002-4000-8000-000000000002',
    'c0a1d001-0003-4000-8000-000000000003',
    'e1ec0001-0014-4000-8000-000000000014',
    1000,
    'debate_won',
    'deba0001-0003-4000-8000-000000000003',
    'cus_seed_sam',
    'pm_seed_sam',
    'seti_seed_campaign_elena_sam',
    'pending'
  ),
  (
    'c4a90001-0004-4000-8000-000000000004',
    'a07e0001-0002-4000-8000-000000000002',
    'c0a1d001-0004-4000-8000-000000000004',
    'e1ec0001-0014-4000-8000-000000000014',
    400,
    'candidate_declares',
    'deba0001-0003-4000-8000-000000000003',
    'cus_seed_sam',
    'pm_seed_sam',
    'seti_seed_campaign_marcus_sam',
    'pending'
  ),
  (
    'c4a90001-0005-4000-8000-000000000005',
    'a07e0001-0001-4000-8000-000000000001',
    'c0a1d001-0005-4000-8000-000000000005',
    'e1ec0001-0037-4000-8000-000000000037',
    750,
    'grassroots_threshold',
    'deba0001-0004-4000-8000-000000000004',
    'cus_seed_jordan',
    'pm_seed_jordan',
    'seti_seed_campaign_priya_jordan',
    'pending'
  )
on conflict (id) do update
set
  donor_id = excluded.donor_id,
  candidate_id = excluded.candidate_id,
  election_id = excluded.election_id,
  amount = excluded.amount,
  unlock_condition = excluded.unlock_condition,
  debate_id = excluded.debate_id,
  stripe_customer_id = excluded.stripe_customer_id,
  stripe_payment_method_id = excluded.stripe_payment_method_id,
  stripe_setup_intent_id = excluded.stripe_setup_intent_id,
  status = excluded.status,
  updated_at = now();
