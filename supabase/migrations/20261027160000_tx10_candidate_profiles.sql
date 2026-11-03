-- Campaign fields for public candidate profiles, plus the TX-10 pair
-- the ballot links to. Idempotent.

alter table public.profiles
  add column if not exists party text,
  add column if not exists office text,
  add column if not exists candidate_stage text,
  add column if not exists district_votes integer not null default 0,
  add column if not exists escrow_pledged numeric(12, 2) not null default 0,
  add column if not exists escrow_target numeric(12, 2) not null default 0;

alter table public.profiles drop constraint if exists profiles_candidate_stage_check;
alter table public.profiles
  add constraint profiles_candidate_stage_check
  check (
    candidate_stage is null
    or candidate_stage in ('PROSPECTIVE', 'CONTENDER', 'ON THE BALLOT')
  );

alter table public.profiles drop constraint if exists profiles_district_votes_check;
alter table public.profiles
  add constraint profiles_district_votes_check
  check (district_votes >= 0);

alter table public.profiles drop constraint if exists profiles_escrow_pledged_check;
alter table public.profiles
  add constraint profiles_escrow_pledged_check
  check (escrow_pledged >= 0);

alter table public.profiles drop constraint if exists profiles_escrow_target_check;
alter table public.profiles
  add constraint profiles_escrow_target_check
  check (escrow_target >= 0);

insert into public.profiles (
  id,
  email,
  full_name,
  display_name,
  legal_name,
  party,
  office,
  candidate_stage,
  ideology_x,
  ideology_y,
  voting_zip_code,
  district_votes,
  escrow_pledged,
  escrow_target,
  onboarding_completed,
  updated_at
)
values
  (
    'c1111111-1111-1111-1111-111111111111',
    'lena.ortiz.tx10@seed.where2run.local',
    'Lena Ortiz',
    'Lena Ortiz',
    'Lena Ortiz',
    'Democratic',
    'U.S. House · TX-10 Primary',
    'CONTENDER',
    -0.520,
    0.410,
    '78701',
    38,
    1850.00,
    3125.00,
    true,
    now()
  ),
  (
    'c2222222-2222-2222-2222-222222222222',
    'caleb.nguyen.tx10@seed.where2run.local',
    'Caleb Nguyen',
    'Caleb Nguyen',
    'Caleb Nguyen',
    'Democratic',
    'U.S. House · TX-10 Primary',
    'PROSPECTIVE',
    -0.310,
    0.150,
    '78701',
    14,
    450.00,
    3125.00,
    true,
    now()
  )
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  display_name = excluded.display_name,
  legal_name = excluded.legal_name,
  party = excluded.party,
  office = excluded.office,
  candidate_stage = excluded.candidate_stage,
  ideology_x = excluded.ideology_x,
  ideology_y = excluded.ideology_y,
  voting_zip_code = excluded.voting_zip_code,
  district_votes = excluded.district_votes,
  escrow_pledged = excluded.escrow_pledged,
  escrow_target = excluded.escrow_target,
  onboarding_completed = excluded.onboarding_completed,
  updated_at = now();

notify pgrst, 'reload schema';
