-- Tier 3 candidate verification and escrow withdrawal.
-- A locked campaign stays in `accumulating` until the candidate files a
-- Statement of Candidacy. Review moves the row to `verification_pending`.
-- `released` is set only after that filing is confirmed, and is what switches
-- the public wallet from pledges to the committee's ActBlue or WinRed page.

alter table public.campaign_targets
  add column if not exists official_candidate_id text,
  add column if not exists escrow_status text not null default 'accumulating',
  add column if not exists committee_name text,
  add column if not exists candidacy_document_url text,
  add column if not exists donation_url text;

alter table public.campaign_targets
  drop constraint if exists campaign_targets_escrow_status_check;

alter table public.campaign_targets
  add constraint campaign_targets_escrow_status_check
  check (escrow_status in ('accumulating', 'verification_pending', 'released'));

alter table public.campaign_targets
  drop constraint if exists campaign_targets_official_candidate_id_check;

alter table public.campaign_targets
  add constraint campaign_targets_official_candidate_id_check
  check (
    official_candidate_id is null
    or (
      official_candidate_id ~ '^[A-Za-z0-9][A-Za-z0-9-]{3,31}$'
      and official_candidate_id !~ '^[0-9]{3}-?[0-9]{2}-?[0-9]{4}$'
    )
  );

alter table public.campaign_targets
  drop constraint if exists campaign_targets_committee_name_check;

alter table public.campaign_targets
  add constraint campaign_targets_committee_name_check
  check (
    committee_name is null
    or char_length(btrim(committee_name)) between 2 and 120
  );

alter table public.campaign_targets
  drop constraint if exists campaign_targets_candidacy_document_url_check;

alter table public.campaign_targets
  add constraint campaign_targets_candidacy_document_url_check
  check (
    candidacy_document_url is null
    or candidacy_document_url ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  );

alter table public.campaign_targets
  drop constraint if exists campaign_targets_donation_url_check;

alter table public.campaign_targets
  add constraint campaign_targets_donation_url_check
  check (
    donation_url is null
    or donation_url ~* '^https://([a-z0-9-]+\.)*(actblue|winred)\.com($|[/?#])'
  );

comment on column public.campaign_targets.official_candidate_id is
  'FEC candidate ID or the state election board equivalent. Not a Social Security number.';

comment on column public.campaign_targets.escrow_status is
  'accumulating, verification_pending, or released.';

comment on column public.campaign_targets.committee_name is
  'Official campaign committee name filed with the Statement of Candidacy.';

comment on column public.campaign_targets.candidacy_document_url is
  'Private storage path of the filed Statement of Candidacy PDF (for example FEC Form 2).';

comment on column public.campaign_targets.donation_url is
  'Official ActBlue or WinRed contribution page, used once escrow_status is released.';

create index if not exists campaign_targets_official_candidate_id_idx
  on public.campaign_targets (official_candidate_id)
  where official_candidate_id is not null;

create index if not exists campaign_targets_escrow_status_idx
  on public.campaign_targets (escrow_status);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidacy-proofs',
  'candidacy-proofs',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists candidacy_proofs_insert_own on storage.objects;
create policy candidacy_proofs_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'candidacy-proofs'
    and name like (auth.uid()::text || '/%')
    and name not like '%..%'
  );

drop policy if exists candidacy_proofs_select_own on storage.objects;
create policy candidacy_proofs_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'candidacy-proofs'
    and name like (auth.uid()::text || '/%')
  );

notify pgrst, 'reload schema';
