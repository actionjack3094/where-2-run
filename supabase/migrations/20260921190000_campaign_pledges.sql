-- Conduit PAC conditional escrow: vaulted cards charged only after a candidate files.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create table if not exists public.campaign_pledges (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references public.users(id) on delete cascade,
  election_id uuid not null references public.districts(id) on delete cascade,
  amount numeric not null check (amount > 0),
  stripe_customer_id text not null,
  stripe_payment_method_id text,
  stripe_setup_intent_id text,
  status text not null default 'pending'
    check (status in ('pending', 'captured', 'failed', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (donor_id <> candidate_id)
);

create index if not exists campaign_pledges_candidate_status_idx
  on public.campaign_pledges (candidate_id, status);

create index if not exists campaign_pledges_donor_idx
  on public.campaign_pledges (donor_id, created_at desc);

create index if not exists campaign_pledges_election_idx
  on public.campaign_pledges (election_id);

create unique index if not exists campaign_pledges_setup_intent_idx
  on public.campaign_pledges (stripe_setup_intent_id)
  where stripe_setup_intent_id is not null;

comment on table public.campaign_pledges is
  'Conditional PAC escrow. Cards are vaulted with SetupIntents and charged off-session when the candidate files.';

comment on column public.campaign_pledges.amount is
  'Pledge amount in USD dollars. Converted to cents at capture.';
comment on column public.campaign_pledges.stripe_payment_method_id is
  'Vaulted card. Null until the donor confirms the SetupIntent.';
comment on column public.campaign_pledges.status is
  'pending = vaulted (or vaulting); captured = charged; failed = off-session charge declined.';

alter table public.campaign_pledges enable row level security;

drop policy if exists campaign_pledges_select_own on public.campaign_pledges;
create policy campaign_pledges_select_own
  on public.campaign_pledges
  for select
  to authenticated
  using (donor_id = auth.uid());

grant select on public.campaign_pledges to authenticated;
grant select, insert, update, delete on public.campaign_pledges to service_role;

notify pgrst, 'reload schema';
