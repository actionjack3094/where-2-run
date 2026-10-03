-- Let a Frontrunner mark a volunteer contacted, and update only their own roster.

alter table public.volunteer_signups
  drop constraint if exists volunteer_signups_status_check;

alter table public.volunteer_signups
  add constraint volunteer_signups_status_check
  check (status in ('pending', 'accepted', 'declined', 'contacted'));

drop policy if exists "Candidate updates volunteer signups" on public.volunteer_signups;
create policy "Candidate updates volunteer signups"
  on public.volunteer_signups
  for update
  to authenticated
  using (campaign_user_id = auth.uid())
  with check (campaign_user_id = auth.uid());

grant update on public.volunteer_signups to authenticated;
