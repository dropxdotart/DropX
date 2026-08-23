-- Likes: one row per (user, response).
create table likes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  response_id uuid not null references responses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, response_id)
);

-- Comments on a response. Flat (no reply-to-reply threading) for v1.
create table comments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  response_id uuid not null references responses(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- Follows: directed edge, follower -> followed.
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followed_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

alter table likes enable row level security;
alter table comments enable row level security;
alter table follows enable row level security;

-- Likes/comments inherit responses' own visibility rule (the EXISTS subquery
-- is itself subject to the responses SELECT policy for the current user, so
-- a response hidden by the spoiler rule hides its likes/comments too).
create policy "Likes visible for visible responses" on likes
  for select to authenticated using (
    exists (select 1 from responses r where r.id = likes.response_id)
  );

create policy "Users can like visible responses" on likes
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from responses r where r.id = likes.response_id)
  );

create policy "Users can unlike their own like" on likes
  for delete to authenticated using (user_id = auth.uid());

create policy "Comments visible for visible responses" on comments
  for select to authenticated using (
    exists (select 1 from responses r where r.id = comments.response_id)
  );

create policy "Users can comment on visible responses" on comments
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from responses r where r.id = comments.response_id)
  );

create policy "Users can delete their own comment" on comments
  for delete to authenticated using (user_id = auth.uid());

create policy "Authenticated users can view follows" on follows
  for select to authenticated using (true);

create policy "Users can follow others" on follows
  for insert to authenticated with check (follower_id = auth.uid());

create policy "Users can unfollow" on follows
  for delete to authenticated using (follower_id = auth.uid());
