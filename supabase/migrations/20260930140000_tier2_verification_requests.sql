-- Document-based Tier 2 residency claims, reviewed by hand.
--
-- public.tier2_verifications already exists and means something else: one row
-- per user, written by the Google Civic address lookup, where the presence of
-- ocd_ids IS the verification (the feed and onboarding read it that way). A
-- pending claim must never live there, so claims get their own queue. A
-- reviewer approves a request by writing the division to tier2_verifications.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create table if not exists public.tier2_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ocd_id text not null check (btrim(ocd_id) <> ''),
  document_type text not null
    check (document_type in ('drivers_license', 'utility_bill', 'lease_agreement', 'voter_registration')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- One open claim per user and division.
create unique index if not exists tier2_verification_requests_open_idx
  on public.tier2_verification_requests (user_id, ocd_id)
  where status = 'pending';

create index if not exists tier2_verification_requests_user_idx
  on public.tier2_verification_requests (user_id, created_at desc);

comment on table public.tier2_verification_requests is
  'Manual Tier 2 residency claims awaiting review. Approval is what writes tier2_verifications.';

alter table public.tier2_verification_requests enable row level security;

drop policy if exists tier2_verification_requests_select_own on public.tier2_verification_requests;
create policy tier2_verification_requests_select_own
  on public.tier2_verification_requests
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.tier2_verification_requests from anon, authenticated;
grant select on public.tier2_verification_requests to authenticated;
grant select, insert, update, delete on public.tier2_verification_requests to service_role;

notify pgrst, 'reload schema';
