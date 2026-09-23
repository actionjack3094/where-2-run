-- Conditional bounty escrow. A voter vaults a card with an off-session
-- SetupIntent. The platform charges it when a candidate files for the election.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create table if not exists public.escrow_pledges (
  id uuid primary key default gen_random_uuid(),
  voter_id uuid not null references public.users(id) on delete cascade,
  election_id uuid not null references public.elections(id) on delete cascade,
  pledged_amount numeric not null check (pledged_amount > 0),
  stripe_setup_intent_id text not null,
  stripe_customer_id text not null,
  stripe_payment_method_id text,
  status text not null default 'vaulted'
    check (status in ('vaulted', 'captured', 'failed', 'canceled')),
  mandate_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists escrow_pledges_voter_idx
  on public.escrow_pledges (voter_id, created_at desc);

create index if not exists escrow_pledges_election_idx
  on public.escrow_pledges (election_id, status);

create unique index if not exists escrow_pledges_setup_intent_idx
  on public.escrow_pledges (stripe_setup_intent_id);

comment on table public.escrow_pledges is
  'Conditional bounties. Cards are saved with off-session SetupIntents and charged when a candidate files.';

comment on column public.escrow_pledges.voter_id is
  'Constituent who authorized the future off-session charge.';
comment on column public.escrow_pledges.election_id is
  'Race whose candidate filing triggers capture.';
comment on column public.escrow_pledges.pledged_amount is
  'Amount in USD dollars authorized for capture. Fixed when the card is vaulted.';
comment on column public.escrow_pledges.stripe_setup_intent_id is
  'Succeeded SetupIntent (usage=off_session) that vaulted the card.';
comment on column public.escrow_pledges.mandate_accepted_at is
  'When the voter accepted the off-session charge agreement.';

alter table public.escrow_pledges enable row level security;

drop policy if exists escrow_pledges_select_own on public.escrow_pledges;
create policy escrow_pledges_select_own
  on public.escrow_pledges
  for select
  to authenticated
  using (voter_id = auth.uid());

grant select on public.escrow_pledges to authenticated;
grant select, insert, update, delete on public.escrow_pledges to service_role;

notify pgrst, 'reload schema';
