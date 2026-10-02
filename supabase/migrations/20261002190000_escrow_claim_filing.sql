-- A claim can file either an FEC/state candidate ID or an https registration link.
-- The ID check stays in place. Links are stored in the same column for review.

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
    or official_candidate_id ~* '^https://[^[:space:]]{8,480}$'
  );

comment on column public.campaign_targets.official_candidate_id is
  'FEC candidate ID, state election board ID, or https state registration link. Not a Social Security number.';
