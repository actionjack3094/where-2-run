-- Authenticated candidates can claim a waiting floor.
-- The waiting-floor and insert migrations shipped without an UPDATE policy,
-- so this file is what `supabase db push` applies on databases that ran those.

drop policy if exists debates_update_authenticated on public.debates;
create policy debates_update_authenticated
  on public.debates
  for update
  to authenticated
  using (status = 'waiting' and candidate_b_id is null)
  with check (candidate_b_id = auth.uid() and status = 'active');

grant update on public.debates to authenticated;

notify pgrst, 'reload schema';
