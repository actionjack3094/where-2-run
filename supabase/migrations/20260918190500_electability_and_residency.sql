-- Phase 9: Database Schema Expansion & Dashboard Foundation
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

-- 1. Residency and eligibility on public.users (app profiles).
alter table public.users
  add column if not exists residency_state text,
  add column if not exists residency_zip text,
  add column if not exists is_eligible_federal boolean not null default true,
  add column if not exists is_eligible_local boolean not null default false;

comment on column public.users.residency_state is
  'Two-letter or full state name for the user''s legal residence.';
comment on column public.users.residency_zip is
  'ZIP code used to match local and state races.';
comment on column public.users.is_eligible_federal is
  'Whether the user can appear on a federal ballot. Defaults true.';
comment on column public.users.is_eligible_local is
  'Whether the user meets local residency rules. Defaults false until verified.';

-- 2. Per-seat electability for a candidate in a district.
--    electability_multiplier is generated from the three tracked inputs:
--      (ideological_match_pct / 100)
--      × (1 + debate_win_rate / 100)
--      × (1 + least(total_escrow_pledged, 10000) / 10000)
--    A perfect ideological match, 100% debate win rate, and $10k in escrow
--    yields 4.0. Zero match yields 0.
create table if not exists public.electability_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  district_id uuid not null references public.districts(id) on delete cascade,
  ideological_match_pct numeric not null default 0
    check (ideological_match_pct >= 0 and ideological_match_pct <= 100),
  debate_win_rate numeric not null default 0
    check (debate_win_rate >= 0 and debate_win_rate <= 100),
  total_escrow_pledged numeric not null default 0
    check (total_escrow_pledged >= 0),
  electability_multiplier numeric generated always as (
    round(
      (coalesce(ideological_match_pct, 0) / 100)
      * (1 + coalesce(debate_win_rate, 0) / 100)
      * (1 + least(coalesce(total_escrow_pledged, 0), 10000) / 10000)
    , 4)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, district_id)
);

create index if not exists electability_scores_user_id_idx
  on public.electability_scores (user_id);

create index if not exists electability_scores_district_id_idx
  on public.electability_scores (district_id);

create index if not exists electability_scores_multiplier_idx
  on public.electability_scores (electability_multiplier desc);

comment on table public.electability_scores is
  'Join of users and districts. Tracks ideology fit, debate win rate, and escrow, then stores a generated electability_multiplier.';

comment on column public.electability_scores.electability_multiplier is
  'Generated: (match/100) * (1 + win_rate/100) * (1 + min(escrow, 10000)/10000).';

create or replace function public.touch_electability_scores_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists electability_scores_set_updated_at on public.electability_scores;
create trigger electability_scores_set_updated_at
  before update on public.electability_scores
  for each row
  execute procedure public.touch_electability_scores_updated_at();

alter table public.electability_scores enable row level security;

drop policy if exists electability_scores_select_public on public.electability_scores;
create policy electability_scores_select_public
  on public.electability_scores
  for select
  to anon, authenticated
  using (true);

drop policy if exists electability_scores_insert_own on public.electability_scores;
create policy electability_scores_insert_own
  on public.electability_scores
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists electability_scores_update_own on public.electability_scores;
create policy electability_scores_update_own
  on public.electability_scores
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists electability_scores_delete_own on public.electability_scores;
create policy electability_scores_delete_own
  on public.electability_scores
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select on public.electability_scores to anon, authenticated, service_role;
grant insert, update, delete on public.electability_scores to authenticated, service_role;

notify pgrst, 'reload schema';
