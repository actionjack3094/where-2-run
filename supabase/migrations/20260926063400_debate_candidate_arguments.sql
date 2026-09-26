-- Seated candidates save their current argument on the debate row.
-- Status and the round counter stay unchanged so the write can be tested on its own.

alter table public.debates
  add column if not exists candidate_a_argument text,
  add column if not exists candidate_b_argument text;

comment on column public.debates.candidate_a_argument is
  'Latest argument text filed by candidate A.';
comment on column public.debates.candidate_b_argument is
  'Latest argument text filed by candidate B.';

drop policy if exists debates_update_argument on public.debates;
create policy debates_update_argument
  on public.debates
  for update
  to authenticated
  using (auth.uid() = candidate_a_id or auth.uid() = candidate_b_id)
  with check (auth.uid() = candidate_a_id or auth.uid() = candidate_b_id);

grant update on public.debates to authenticated;

notify pgrst, 'reload schema';
