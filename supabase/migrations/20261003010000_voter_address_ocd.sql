-- Private residential address and the OCD-IDs that unlock My Ballot.
-- residential_address holds ciphertext. Public pages must not select it.

alter table public.profiles
  add column if not exists residential_address text,
  add column if not exists state_code varchar(2),
  add column if not exists congressional_district text,
  add column if not exists state_leg_district_upper text,
  add column if not exists state_leg_district_lower text,
  add column if not exists county text,
  add column if not exists municipality text,
  add column if not exists ocd_ids text[] not null default '{}'::text[];

alter table public.profiles
  drop constraint if exists profiles_state_code_check;

alter table public.profiles
  add constraint profiles_state_code_check
  check (state_code is null or state_code ~ '^[A-Z]{2}$');

comment on column public.profiles.residential_address is
  'Private ciphertext of the voter residential address. Do not select this column for public pages.';

comment on column public.profiles.ocd_ids is
  'Every Open Civic Data division that contains this residential address.';

create index if not exists profiles_ocd_ids_gin
  on public.profiles using gin (ocd_ids);
