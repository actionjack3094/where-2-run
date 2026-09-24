-- Authenticated candidates can open a debate floor.
-- The waiting-floor migration already shipped without this policy, so this
-- file is what `supabase db push` applies on databases that ran that migration.

drop policy if exists debates_insert_authenticated on public.debates;
create policy debates_insert_authenticated
  on public.debates
  for insert
  to authenticated
  with check (auth.uid() = candidate_a_id);

grant insert on public.debates to authenticated;

notify pgrst, 'reload schema';
