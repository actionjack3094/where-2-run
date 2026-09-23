-- Marks a candidate ticket that has finished the unified onboarding wizard.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.candidates
  add column if not exists onboarding_completed boolean not null default false;

comment on column public.candidates.onboarding_completed is
  'True after the candidate leaves the onboarding wizard and enters the arena.';

notify pgrst, 'reload schema';
