-- Spectators cast one ballot through the authenticated server client.
-- The unique (debate_id, voter_id) constraint rejects a second vote.

drop policy if exists votes_insert_own on public.votes;
create policy votes_insert_own
  on public.votes
  for insert
  to authenticated
  with check (voter_id = auth.uid());

grant insert on public.votes to authenticated;

notify pgrst, 'reload schema';
