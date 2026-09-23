-- Two-stage draft funnel: party primary electorates, the general electorate,
-- and a normalized PVI on each election.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.elections
  add column if not exists primary_rep_vector vector(6),
  add column if not exists primary_dem_vector vector(6),
  add column if not exists general_vector vector(6),
  add column if not exists pvi_score double precision;

comment on column public.elections.primary_rep_vector is
  'Republican primary electorate. Six civic axes in [0, 1]: climate, healthcare, immigration, economy, social, safety.';

comment on column public.elections.primary_dem_vector is
  'Democratic primary electorate. Six civic axes in [0, 1]: climate, healthcare, immigration, economy, social, safety.';

comment on column public.elections.general_vector is
  'General-election electorate on the same six axes. Primary lanes sit further toward each pole than this median.';

comment on column public.elections.pvi_score is
  'Partisan lean from -1.0 (deep Democratic) to +1.0 (deep Republican). Cook-style points map by dividing by 50, so D+24 is -0.48 and R+13 is +0.26.';

alter table public.elections
  drop constraint if exists elections_pvi_score_range_check;

alter table public.elections
  add constraint elections_pvi_score_range_check
  check (pvi_score is null or (pvi_score >= -1::double precision and pvi_score <= 1::double precision));

notify pgrst, 'reload schema';
