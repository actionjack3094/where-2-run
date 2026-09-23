-- Tier 2 onboarding stores civic divisions on tier2_verifications.
-- target_district_id stays on public.users, but it is not required to
-- reference public.districts before a seat is filed.

alter table public.users
  drop constraint if exists users_target_district_id_fkey;

comment on column public.users.target_district_id is
  'Optional district the runner is filing for. Not a foreign key, so address verification can finish before a districts row exists.';

notify pgrst, 'reload schema';
