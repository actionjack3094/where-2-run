-- Civic fencing: map Google Civic OCD division IDs onto campaign profiles.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.
--
-- ocd_identifiers and tier_2_verified live on public.users (app profiles).
-- The Civic API keys of the `divisions` object are stored as text[].

alter table public.users
  add column if not exists ocd_identifiers text[] not null default '{}'::text[];

alter table public.users
  add column if not exists tier_2_verified boolean not null default false;

create index if not exists users_ocd_identifiers_gin_idx
  on public.users using gin (ocd_identifiers);

create index if not exists users_tier_2_verified_idx
  on public.users (tier_2_verified)
  where tier_2_verified = true;

comment on column public.users.ocd_identifiers is
  'Open Civic Data division IDs returned as keys of Google Civic Information API `divisions`.';

comment on column public.users.tier_2_verified is
  'True after a successful Civic API address lookup mapped OCD identifiers onto the profile.';

notify pgrst, 'reload schema';
