-- Production expansion: OCD election cycles, tier-3 candidate claims,
-- geofenced notification receipts, and jury holds that block ELO finalization.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.districts
  add column if not exists ocd_id text;

create unique index if not exists districts_ocd_id_idx
  on public.districts (ocd_id)
  where ocd_id is not null;

comment on column public.districts.ocd_id is
  'Open Civic Data division for this geography. Address lookup assigns constituents here.';

alter table public.candidates
  add column if not exists claimed_by uuid references public.users(id) on delete set null;

comment on column public.candidates.claimed_by is
  'Authenticated campaign manager who submitted a tier-3 claim on this seeded ticket.';

alter table public.votes
  add column if not exists voided_at timestamptz;

comment on column public.votes.voided_at is
  'Set when the jury upholds a report against this ballot. Voided votes are excluded from the winner tally.';

create index if not exists votes_active_debate_idx
  on public.votes (debate_id)
  where voided_at is null;

create table if not exists public.election_cycles (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  name text not null,
  election_day date not null,
  ocd_id text not null,
  level text not null,
  election_id uuid references public.elections(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default timezone('utc'::text, now()),
  constraint election_cycles_source_check
    check (source in ('google_civic', 'democracy_works')),
  constraint election_cycles_level_check
    check (level in ('federal', 'state', 'municipal')),
  constraint election_cycles_ocd_id_check
    check (ocd_id like 'ocd-division/%'),
  constraint election_cycles_source_external_key unique (source, external_id)
);

create index if not exists election_cycles_ocd_id_idx
  on public.election_cycles (ocd_id);

create index if not exists election_cycles_election_day_idx
  on public.election_cycles (election_day);

comment on table public.election_cycles is
  'Federal, state, and municipal cycles ingested from Google Civic or Democracy Works and keyed by OCD-ID.';

create table if not exists public.tier3_verifications (
  user_id uuid primary key references public.users(id) on delete cascade,
  claimed_candidate_id uuid references public.candidates(id) on delete set null,
  claim_status text not null default 'pending',
  government_id_reference text,
  government_id_status text not null default 'unsubmitted',
  ballot_name text,
  ballot_ocd_id text,
  ballot_source text,
  ballot_cross_reference jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint tier3_claim_status_check
    check (claim_status in ('pending', 'submitted', 'matched', 'rejected')),
  constraint tier3_government_id_status_check
    check (government_id_status in ('unsubmitted', 'submitted', 'matched', 'rejected')),
  constraint tier3_ballot_cross_reference_object_check
    check (jsonb_typeof(ballot_cross_reference) = 'object')
);

create unique index if not exists tier3_active_claim_idx
  on public.tier3_verifications (claimed_candidate_id)
  where claimed_candidate_id is not null
    and claim_status in ('submitted', 'matched');

comment on table public.tier3_verifications is
  'Tier 3 candidate claim. Stores a government-ID reference token and a local ballot cross-reference, never a document image or full ID number.';

comment on column public.tier3_verifications.government_id_reference is
  'Opaque review reference (case id or last-four token). Not a full driver license, passport, or SSN.';

comment on column public.tier3_verifications.ballot_cross_reference is
  'Local ballot match: printed name, OCD division, and source used to confirm the seeded profile.';

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  target_kind text not null,
  argument_id uuid references public.arguments(id) on delete cascade,
  vote_id uuid references public.votes(id) on delete cascade,
  debate_id uuid not null references public.debates(id) on delete cascade,
  reason text not null,
  note text,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint community_reports_target_kind_check
    check (target_kind in ('argument', 'vote', 'debate')),
  constraint community_reports_reason_check
    check (reason in ('bad_faith', 'spam', 'abandoned', 'off_platform', 'other')),
  constraint community_reports_status_check
    check (status in ('open', 'queued', 'upheld', 'dismissed')),
  constraint community_reports_target_check check (
    (target_kind = 'argument' and argument_id is not null and vote_id is null)
    or (target_kind = 'vote' and vote_id is not null and argument_id is null)
    or (target_kind = 'debate' and argument_id is null and vote_id is null)
  )
);

create unique index if not exists community_reports_reporter_argument_idx
  on public.community_reports (reporter_id, argument_id)
  where argument_id is not null;

create unique index if not exists community_reports_reporter_vote_idx
  on public.community_reports (reporter_id, vote_id)
  where vote_id is not null;

create unique index if not exists community_reports_reporter_debate_idx
  on public.community_reports (reporter_id, debate_id, reason)
  where target_kind = 'debate';

create index if not exists community_reports_debate_idx
  on public.community_reports (debate_id, created_at desc);

comment on table public.community_reports is
  'Constituent reports of bad-faith arguments, spam, or abandoned debates.';

create table if not exists public.arbitration_cases (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.debates(id) on delete cascade,
  report_id uuid references public.community_reports(id) on delete set null,
  kind text not null,
  status text not null default 'open',
  holds_elo boolean not null default true,
  reviewer_id uuid references public.users(id) on delete set null,
  resolution_note text,
  opened_at timestamptz not null default timezone('utc'::text, now()),
  resolved_at timestamptz,
  constraint arbitration_cases_kind_check
    check (kind in ('flagged_vote', 'bad_faith_argument', 'abandoned_debate')),
  constraint arbitration_cases_status_check
    check (status in ('open', 'upheld', 'dismissed'))
);

create unique index if not exists arbitration_cases_open_debate_idx
  on public.arbitration_cases (debate_id)
  where status = 'open';

create index if not exists arbitration_cases_open_idx
  on public.arbitration_cases (opened_at)
  where status = 'open';

comment on table public.arbitration_cases is
  'Jury queue. An open row with holds_elo blocks the nightly job from finalizing ELO.';

create table if not exists public.notification_dispatches (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  debate_id uuid references public.debates(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  ocd_id text,
  sent_at timestamptz not null default timezone('utc'::text, now()),
  constraint notification_dispatches_kind_check
    check (kind in ('debate_countdown', 'local_challenge', 'digest')),
  constraint notification_dispatches_debate_recipient_key unique (kind, debate_id, recipient_id)
);

create index if not exists notification_dispatches_recipient_idx
  on public.notification_dispatches (recipient_id, sent_at desc);

comment on table public.notification_dispatches is
  'Receipts for geofenced debate alerts so a constituent is not mailed twice for the same floor.';

alter table public.election_cycles enable row level security;
alter table public.tier3_verifications enable row level security;
alter table public.community_reports enable row level security;
alter table public.arbitration_cases enable row level security;
alter table public.notification_dispatches enable row level security;

drop policy if exists election_cycles_select_public on public.election_cycles;
create policy election_cycles_select_public
  on public.election_cycles
  for select
  to anon, authenticated
  using (true);

drop policy if exists tier3_verifications_select_own on public.tier3_verifications;
create policy tier3_verifications_select_own
  on public.tier3_verifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists community_reports_select_own on public.community_reports;
create policy community_reports_select_own
  on public.community_reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

drop policy if exists community_reports_insert_own on public.community_reports;
create policy community_reports_insert_own
  on public.community_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists arbitration_cases_select_authenticated on public.arbitration_cases;
create policy arbitration_cases_select_authenticated
  on public.arbitration_cases
  for select
  to authenticated
  using (true);

grant select on public.election_cycles to anon, authenticated, service_role;
grant select, insert, update, delete on public.election_cycles to service_role;

grant select on public.tier3_verifications to authenticated, service_role;
grant select, insert, update, delete on public.tier3_verifications to service_role;

grant select, insert on public.community_reports to authenticated, service_role;
grant update, delete on public.community_reports to service_role;

grant select on public.arbitration_cases to authenticated, service_role;
grant select, insert, update, delete on public.arbitration_cases to service_role;

grant select, insert, update, delete on public.notification_dispatches to service_role;

-- Winner tally ignores ballots the jury has voided.
create or replace function public.calculate_debate_winner(debate_uuid uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  with debate_row as (
    select candidate_a_id, candidate_b_id
    from public.debates
    where id = debate_uuid
  ),
  tallies as (
    select
      v.candidate_id,
      count(*)::int as vote_count
    from public.votes v
    cross join debate_row d
    where v.debate_id = debate_uuid
      and v.voided_at is null
      and v.candidate_id in (d.candidate_a_id, d.candidate_b_id)
    group by v.candidate_id
  ),
  ranked as (
    select
      candidate_id,
      vote_count,
      rank() over (order by vote_count desc) as place
    from tallies
  )
  select candidate_id
  from ranked
  where place = 1
    and (select count(*) from ranked where place = 1) = 1;
$$;

comment on function public.calculate_debate_winner(uuid) is
  'Winning candidate from live ballots. Null on a tie, an empty ballot, or when every vote was voided.';

-- Nightly finalization skips open jury holds and unseated floors.
create or replace function public.complete_expired_debates()
returns table (debate_id uuid, winner_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in
    update public.debates d
    set status = 'completed'
    where d.expires_at < now()
      and d.status in ('active', 'voting')
      and d.candidate_a_id is not null
      and d.candidate_b_id is not null
      and not exists (
        select 1
        from public.arbitration_cases c
        where c.debate_id = d.id
          and c.status = 'open'
          and c.holds_elo
      )
    returning d.id
  loop
    perform public.apply_debate_elo(rec.id);
    debate_id := rec.id;
    winner_id := public.calculate_debate_winner(rec.id);
    return next;
  end loop;
end;
$$;

comment on function public.complete_expired_debates() is
  'Completes expired seated debates and applies ELO, skipping open jury holds.';

notify pgrst, 'reload schema';
