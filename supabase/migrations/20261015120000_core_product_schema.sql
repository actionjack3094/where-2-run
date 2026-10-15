-- Match confidence and voting ZIP live on the profile.
-- Arena clashes record the two-stage window: opening, then a 48-hour rebuttal.

alter table public.profiles
  add column if not exists confidence_score double precision,
  add column if not exists voting_zip_code text;

alter table public.profiles drop constraint if exists profiles_confidence_score_range;
alter table public.profiles
  add constraint profiles_confidence_score_range
  check (
    confidence_score is null
    or (confidence_score >= 0::double precision and confidence_score <= 1::double precision)
  );

comment on column public.profiles.confidence_score is
  'Match confidence on the ideology plane. Onboarding files 0.68. Townhall calibration raises it.';
comment on column public.profiles.voting_zip_code is
  'Five-digit ZIP used to calculate local ballot access.';

alter table public.arena_debates
  add column if not exists clash_stage text,
  add column if not exists rebuttal_expires_at timestamptz;

alter table public.arena_debates drop constraint if exists arena_debates_clash_stage_check;
alter table public.arena_debates
  add constraint arena_debates_clash_stage_check
  check (clash_stage is null or clash_stage in ('opening', 'rebuttal', 'closed'));

comment on column public.arena_debates.clash_stage is
  'Two-stage clash: opening, then rebuttal, then closed.';
comment on column public.arena_debates.rebuttal_expires_at is
  'When the 48-hour rebuttal and Q&A window ends.';
