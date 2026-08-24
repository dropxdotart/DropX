-- Extensions
create extension if not exists "uuid-ossp";

-- ─── TYPES ───────────────────────────────────────────────────────────────────
create type challenge_type as enum ('multiple_choice', 'text', 'photo');
create type user_role as enum ('user', 'mod', 'admin');
create type moderation_status as enum ('pending', 'approved', 'rejected');

-- ─── CHALLENGES ──────────────────────────────────────────────────────────────
-- A pool of authored challenges. `drop_at` is null while a challenge sits in
-- the pool, and is filled in by the daily drop job (see /api/cron/drop) once
-- it's picked and given a random moment inside the day's window — that keeps
-- the exact drop time unknown until it actually happens (see RLS below).
create table challenges (
  id uuid primary key default uuid_generate_v4(),
  drop_at timestamptz unique,
  type challenge_type not null default 'multiple_choice',
  prompt text not null,
  choices jsonb,
  correct_answer text not null,
  explanation text,
  created_at timestamptz not null default now()
);

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- One row per user; tracks streaks. `username` is the permanent, unique
-- @tag; `display_name` is the editable name shown around the app.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  display_name_changed_at timestamptz,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_answered_date date,
  role user_role not null default 'user',
  badges text[] not null default '{}',
  strike_count int not null default 0,
  show_everyone_tab boolean not null default true,
  share_to_everyone boolean not null default true,
  created_at timestamptz not null default now()
);

-- display_name can only change once every 48 hours — enforced here (not
-- just in application code) so it holds even against a direct table update,
-- and display_name_changed_at is always trigger-set, never client-supplied.
create function public.enforce_display_name_cooldown()
returns trigger as $$
begin
  if new.display_name is distinct from old.display_name then
    if old.display_name_changed_at is not null
       and now() - old.display_name_changed_at < interval '48 hours' then
      raise exception 'display_name can only be changed once every 48 hours';
    end if;
    new.display_name_changed_at := now();
  else
    new.display_name_changed_at := old.display_name_changed_at;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger enforce_display_name_cooldown
  before update on profiles
  for each row execute procedure enforce_display_name_cooldown();

-- ─── RESPONSES ───────────────────────────────────────────────────────────────
-- One row per (user, challenge) answer. Unique constraint enforces one attempt.
-- `is_correct` is null for a photo response until a mod approves/rejects it
-- (moderation_status starts 'pending'); text/multiple_choice grade instantly
-- and are inserted already 'approved' with is_correct set.
create table responses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  answer text not null,
  is_correct boolean,
  photo_url text,
  moderation_status moderation_status not null default 'approved',
  answered_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

-- Also FK to profiles (always in sync 1:1 with auth.users via the trigger
-- below) so PostgREST can auto-embed profiles when querying responses,
-- e.g. for the feed page.
alter table responses
  add constraint responses_user_id_profiles_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

-- ─── LIKES ───────────────────────────────────────────────────────────────────
create table likes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  response_id uuid not null references responses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, response_id)
);

-- ─── COMMENTS ────────────────────────────────────────────────────────────────
-- Flat (no reply-to-reply threading) for v1.
create table comments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  response_id uuid not null references responses(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- ─── FOLLOWS ─────────────────────────────────────────────────────────────────
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followed_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

-- Auto-create a profile row when a user signs up.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
alter table challenges enable row level security;
alter table profiles enable row level security;
alter table responses enable row level security;
alter table likes enable row level security;
alter table comments enable row level security;
alter table follows enable row level security;

-- Also hides pool challenges (drop_at is null) from clients entirely, since
-- null <= now() is never true — only the admin (service role) client used by
-- the cron job can see/pick from the pool.
create policy "Dropped challenges are readable" on challenges
  for select using (drop_at <= now());

-- Profiles (username/badges/role) are visible to any signed-in user so the
-- feed can show who answered what.
create policy "Authenticated users can view profiles" on profiles
  for select to authenticated using (true);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- A response is visible to another viewer only once the viewer has answered
-- that same challenge themselves (this also covers "view own responses",
-- since you always match your own row) — keeps the feed spoiler-free for
-- whichever challenge is still live. Routed through a security-definer
-- function rather than a plain subquery on responses, because a subquery
-- on the same table re-triggers this same policy and recurses infinitely.
create function has_answered(target_challenge_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from responses
    where challenge_id = target_challenge_id
    and user_id = auth.uid()
  );
$$;

-- Your own responses are always visible to you; others' are visible once
-- approved, or while still pending within a 10-minute grace window — a
-- photo response that never gets moderated just stops matching this policy
-- once its own timestamp ages past the window (no cron needed).
create policy "Responses visible after you've answered that challenge" on responses
  for select to authenticated using (
    has_answered(challenge_id)
    and (
      user_id = auth.uid()
      or moderation_status = 'approved'
      or (moderation_status = 'pending' and answered_at > now() - interval '10 minutes')
    )
  );

-- Mods/admins see every pending item regardless of the spoiler gate above
-- (they may not have personally answered that challenge).
create policy "Mods can view all pending responses" on responses
  for select to authenticated using (
    moderation_status = 'pending'
    and exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

-- The `moderation_status = 'pending'` guard here (mirrored in the app's own
-- UPDATE ... WHERE clause) is what makes concurrent approve/deny from two
-- mods race-safe: whichever request's row lock commits first flips the
-- status, so the second one's WHERE clause (and this policy) no longer
-- match the row. `using` and `with check` are deliberately different here —
-- an UPDATE policy with only `using` implicitly reuses it as the check too,
-- which would reject the mod's own update for moving status away from
-- 'pending' (the entire point of approving/rejecting something).
create policy "Mods can moderate pending responses" on responses
  for update to authenticated
  using (
    moderation_status = 'pending'
    and exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

create policy "Users can insert own responses" on responses
  for insert with check (auth.uid() = user_id);

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
