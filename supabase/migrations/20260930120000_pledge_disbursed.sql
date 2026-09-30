-- Candidate payouts. A released pledge (unlock condition met) becomes
-- `disbursed` once the candidate requests a payout from the Campaign Hub.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.campaign_pledges
  add column if not exists disbursed_at timestamptz;

comment on column public.campaign_pledges.disbursed_at is
  'When the candidate requested payout of this released pledge.';

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
  check (status in ('pending', 'released', 'disbursed', 'captured', 'failed', 'canceled'));

comment on column public.campaign_pledges.status is
  'pending = waiting on its unlock condition; released = condition met, available to the candidate; disbursed = payout requested; captured = charged; failed = off-session charge declined.';

notify pgrst, 'reload schema';
