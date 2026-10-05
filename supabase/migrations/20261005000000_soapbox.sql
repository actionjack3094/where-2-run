-- Lane 1: The Soapbox.
-- A stump speech is public. A same-party peer can challenge it into an arena
-- debate that contests every overlapping primary they both share. The author
-- has 24 hours to accept.

create table if not exists public.soapbox_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint soapbox_posts_content_check check (char_length(btrim(content)) between 1 and 280)
);

create index if not exists soapbox_posts_created_idx
  on public.soapbox_posts (created_at desc);

comment on table public.soapbox_posts is
  'Lane 1 stump speeches. Public read. A challenge points here via arena_debates.source_post_id.';

create table if not exists public.soapbox_votes (
  post_id uuid not null references public.soapbox_posts (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  direction smallint not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint soapbox_votes_pk primary key (post_id, voter_id),
  constraint soapbox_votes_direction_check check (direction in (-1, 1))
);

create index if not exists soapbox_votes_post_idx
  on public.soapbox_votes (post_id);

comment on table public.soapbox_votes is
  'One vote per member on a stump speech. 1 is an upvote, -1 is a downvote.';

alter table public.arena_debates
  add column if not exists source_post_id uuid references public.soapbox_posts (id) on delete set null,
  add column if not exists expires_at timestamptz;

comment on column public.arena_debates.source_post_id is
  'Soapbox stump speech this challenge answers. Null for Arena-native seats.';
comment on column public.arena_debates.expires_at is
  'Acceptance deadline for a Soapbox challenge. 24 hours after the challenge is filed.';

alter table public.arena_debates drop constraint if exists arena_debates_status_check;
alter table public.arena_debates
  add constraint arena_debates_status_check
  check (status in (
    'open_challenge',
    'active',
    'concluded',
    'cancelled',
    'pending_acceptance'
  ));

-- arena_debates.primary_id stays the anchor race. Every selected primary,
-- including the anchor, is stored here so the judged result can move each ladder.
create table if not exists public.arena_debate_primaries (
  debate_id uuid not null references public.arena_debates (id) on delete cascade,
  primary_id uuid not null references public.primaries (id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint arena_debate_primaries_pk primary key (debate_id, primary_id)
);

create index if not exists arena_debate_primaries_primary_idx
  on public.arena_debate_primaries (primary_id);

comment on table public.arena_debate_primaries is
  'Primaries a Soapbox challenge contests. The judged result propagates to each leaderboard.';

alter table public.soapbox_posts enable row level security;
alter table public.soapbox_votes enable row level security;
alter table public.arena_debate_primaries enable row level security;

drop policy if exists "Public read soapbox posts" on public.soapbox_posts;
create policy "Public read soapbox posts"
  on public.soapbox_posts
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated insert soapbox posts" on public.soapbox_posts;
create policy "Authenticated insert soapbox posts"
  on public.soapbox_posts
  for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "Public read soapbox votes" on public.soapbox_votes;
create policy "Public read soapbox votes"
  on public.soapbox_votes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated insert soapbox votes" on public.soapbox_votes;
create policy "Authenticated insert soapbox votes"
  on public.soapbox_votes
  for insert
  to authenticated
  with check (voter_id = auth.uid());

drop policy if exists "Authenticated update own soapbox votes" on public.soapbox_votes;
create policy "Authenticated update own soapbox votes"
  on public.soapbox_votes
  for update
  to authenticated
  using (voter_id = auth.uid())
  with check (voter_id = auth.uid());

drop policy if exists "Authenticated delete own soapbox votes" on public.soapbox_votes;
create policy "Authenticated delete own soapbox votes"
  on public.soapbox_votes
  for delete
  to authenticated
  using (voter_id = auth.uid());

drop policy if exists "Public read arena debate primaries" on public.arena_debate_primaries;
create policy "Public read arena debate primaries"
  on public.arena_debate_primaries
  for select
  to anon, authenticated
  using (true);

grant select on public.soapbox_posts, public.soapbox_votes, public.arena_debate_primaries
  to anon, authenticated, service_role;

grant insert on public.soapbox_posts, public.soapbox_votes to authenticated;
grant update, delete on public.soapbox_votes to authenticated;

grant insert, update, delete on public.soapbox_posts, public.soapbox_votes, public.arena_debate_primaries
  to service_role;

grant select (source_post_id, expires_at) on public.arena_debates to anon, authenticated;

notify pgrst, 'reload schema';
