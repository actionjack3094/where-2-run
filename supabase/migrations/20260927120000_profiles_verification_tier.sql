-- Mock civic verification for voter district onboarding.
-- public.users.verification_tier is a constrained identity ladder and rejects 'tier2'.
-- The MVP flag lives on public.profiles so address verification can be simulated
-- without changing that ladder. service_role bypasses RLS on profiles.

alter table public.profiles
  add column if not exists verification_tier text;

comment on column public.profiles.verification_tier is
  'MVP mock address verification. tier2 means the voter confirmed a local district.';

notify pgrst, 'reload schema';
