-- Production seed for the TX-10 House seat and its SALT deduction question.
-- Idempotent: existing rows with these ids are left unchanged.

insert into public.elections (
  id,
  slug,
  office_name,
  median_voter_vector,
  incumbent_name,
  filing_requirements,
  district_id,
  ocd_id,
  primary_rep_vector,
  primary_dem_vector,
  general_vector,
  pvi_score,
  updated_at
)
values (
  'e1ec0001-0010-4000-8000-000000000010',
  'tx-us-house-10-2026',
  'U.S. House Texas District 10',
  '[0.32,0.28,0.26,0.30,0.34,0.36]'::vector(6),
  'Michael McCaul',
  jsonb_build_object(
    'jurisdiction', 'Texas 10th Congressional District',
    'office', 'U.S. House Texas District 10',
    'level', 'federal',
    'state', 'TX',
    'ocd_id', 'ocd-division/country:us/state:tx/cd:10',
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
  'd1570001-0010-4000-8000-000000000010',
  'ocd-division/country:us/state:tx/cd:10',
  '[0.10,0.12,0.08,0.10,0.14,0.16]'::vector(6),
  '[0.80,0.78,0.74,0.76,0.82,0.68]'::vector(6),
  '[0.32,0.28,0.26,0.30,0.34,0.36]'::vector(6),
  0.26,
  now()
)
on conflict (id) do nothing;

insert into public.election_questions (
  id,
  election_id,
  prompt,
  jurisdictional_level,
  primary_axis,
  applicable_ocd_ids,
  information_gain_score
)
select
  'a10e0001-0010-4000-8000-000000000010',
  'e1ec0001-0010-4000-8000-000000000010',
  'Should Congress raise the cap on the state and local tax deduction for households in Texas''s 10th Congressional District?',
  'federal',
  'economy',
  jsonb_build_array('ocd-division/country:us/state:tx/cd:10'),
  1
where not exists (
  select 1
  from public.election_questions q
  where q.id = 'a10e0001-0010-4000-8000-000000000010'
     or (
       q.election_id = 'e1ec0001-0010-4000-8000-000000000010'
       and q.prompt = 'Should Congress raise the cap on the state and local tax deduction for households in Texas''s 10th Congressional District?'
     )
)
on conflict (id) do nothing;
