-- Tier 2 civic verification. One row per constituent.
-- verified_address is application-layer AES-256-GCM ciphertext (v1:<base64url>),
-- never the residential address in plaintext.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create table if not exists public.tier2_verifications (
  user_id uuid primary key references public.users(id) on delete cascade,
  verified_address text not null,
  ocd_ids jsonb not null default '[]'::jsonb,
  verified_at timestamptz not null default now(),
  constraint tier2_verifications_ocd_ids_array check (jsonb_typeof(ocd_ids) = 'array')
);

create index if not exists tier2_verifications_ocd_ids_gin_idx
  on public.tier2_verifications using gin (ocd_ids);

comment on table public.tier2_verifications is
  'Constituent address verification from the Google Civic Information API.';

comment on column public.tier2_verifications.user_id is
  'Profile that completed Tier 2 civic verification. One row per user.';

comment on column public.tier2_verifications.verified_address is
  'AES-256-GCM ciphertext of the residential address. Not readable by authenticated clients.';

comment on column public.tier2_verifications.ocd_ids is
  'JSON array of Open Civic Data division IDs, the keys of the Civic API divisions object.';

comment on column public.tier2_verifications.verified_at is
  'When the Civic API lookup succeeded and the divisions were stored.';

alter table public.tier2_verifications enable row level security;

drop policy if exists tier2_verifications_select_own on public.tier2_verifications;
create policy tier2_verifications_select_own
  on public.tier2_verifications
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.tier2_verifications from anon, authenticated;
grant select (user_id, ocd_ids, verified_at) on public.tier2_verifications to authenticated;
grant select, insert, update, delete on public.tier2_verifications to service_role;

notify pgrst, 'reload schema';
