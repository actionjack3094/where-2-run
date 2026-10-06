-- Demo surfaces: candidate bios, Soapbox tags and upvote totals, pledged war
-- chests on each primary ladder, and an enlisted volunteer status.

alter table public.profiles
  add column if not exists bio text;

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles
  add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 600);

comment on column public.profiles.bio is
  'Short public biography. Shown on the candidate profile.';

alter table public.soapbox_posts
  add column if not exists tags text[] not null default '{}',
  add column if not exists upvote_count integer not null default 0;

create or replace function public.soapbox_tags_valid(tags text[])
returns boolean
language sql
immutable
as $$
  select cardinality(tags) <= 4
    and not exists (
      select 1
      from unnest(tags) as tag
      where char_length(btrim(tag)) = 0
        or char_length(tag) > 32
    );
$$;

alter table public.soapbox_posts drop constraint if exists soapbox_posts_tags_check;
alter table public.soapbox_posts
  add constraint soapbox_posts_tags_check
  check (public.soapbox_tags_valid(tags));

alter table public.soapbox_posts drop constraint if exists soapbox_posts_upvote_count_check;
alter table public.soapbox_posts
  add constraint soapbox_posts_upvote_count_check
  check (upvote_count >= 0);

comment on column public.soapbox_posts.tags is
  'Issue tags on a stump speech, such as Housing or Transit.';
comment on column public.soapbox_posts.upvote_count is
  'Seeded and displayed upvote total. Live votes are counted on top of this base.';

alter table public.primary_standings
  add column if not exists pledged_war_chest numeric not null default 0;

alter table public.primary_standings drop constraint if exists primary_standings_war_chest_check;
alter table public.primary_standings
  add constraint primary_standings_war_chest_check
  check (pledged_war_chest >= 0);

comment on column public.primary_standings.pledged_war_chest is
  'Dollars pledged to this candidate in this primary.';

alter table public.volunteer_signups drop constraint if exists volunteer_signups_status_check;
alter table public.volunteer_signups
  add constraint volunteer_signups_status_check
  check (status in ('pending', 'accepted', 'declined', 'contacted', 'enlisted'));

notify pgrst, 'reload schema';
