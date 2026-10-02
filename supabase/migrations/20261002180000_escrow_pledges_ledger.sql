-- Escrow checkout ledger. campaign_pledges already records donor, candidate,
-- and race. This adds the locked campaign target and the held status used when
-- Stripe authorizes a card without capturing it.

alter table public.campaign_pledges
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists target_id uuid references public.campaign_targets(id) on delete set null;

update public.campaign_pledges
set user_id = donor_id
where user_id is null
  and donor_id is not null
  and exists (select 1 from public.users where users.id = campaign_pledges.donor_id);

comment on column public.campaign_pledges.user_id is
  'Constituent who authorized the escrow hold. Matches the Checkout Session metadata user_id.';

comment on column public.campaign_pledges.target_id is
  'Locked campaign_targets row this hold funds. Matches the Checkout Session metadata target_id.';

create index if not exists campaign_pledges_target_status_idx
  on public.campaign_pledges (target_id, status);

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.campaign_pledges'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.campaign_pledges drop constraint %I', rec.conname);
  end loop;
end
$$;

alter table public.campaign_pledges
  add constraint campaign_pledges_status_check
  check (status in ('pending', 'held', 'released', 'disbursed', 'captured', 'failed', 'canceled'));

comment on column public.campaign_pledges.status is
  'held = Checkout authorized the card and capture is still manual. pending = waiting on an unlock condition. released = available to the candidate. disbursed = payout requested. captured = charged. failed = authorization or charge declined.';
