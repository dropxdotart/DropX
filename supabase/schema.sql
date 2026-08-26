-- Extensions
create extension if not exists "uuid-ossp";

-- ─── TYPES ───────────────────────────────────────────────────────────────────
create type challenge_type as enum ('multiple_choice', 'text', 'photo');
create type user_role as enum ('user', 'mod', 'admin');
create type moderation_status as enum ('pending', 'approved', 'rejected');
create type account_status as enum ('active', 'suspended', 'banned');

-- ─── APP CONFIG ──────────────────────────────────────────────────────────────
-- Singleton row (the boolean PK + check forces exactly one) — the drop
-- window and photo grace period are admin-editable, not hardcoded constants.
create table app_config (
  id boolean primary key default true check (id),
  drop_window_start_hour int not null default 12,
  drop_window_end_hour int not null default 19,
  photo_grace_minutes int not null default 10,
  updated_at timestamptz not null default now()
);
insert into app_config (id) values (true);

-- ─── CHALLENGES ──────────────────────────────────────────────────────────────
-- A pool of authored challenges. `drop_at` is null while a challenge sits in
-- the pool, and is filled in by the daily drop job (see /api/cron/drop) once
-- it's picked and given a random moment inside the day's window — that keeps
-- the exact drop time unknown until it actually happens (see RLS below).
-- `scheduled_date`, when set, tells the drop job to prefer this challenge for
-- that specific date instead of picking randomly from the pool.
create table challenges (
  id uuid primary key default uuid_generate_v4(),
  drop_at timestamptz unique,
  scheduled_date date unique,
  type challenge_type not null default 'multiple_choice',
  prompt text not null,
  choices jsonb,
  correct_answer text not null,
  explanation text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- One row per user; tracks streaks. `username` is the permanent, unique
-- @tag; `display_name` is the editable name shown around the app.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- Always lowercase — enforced below, not just client-side, so two users
  -- can never end up with handles that only differ by case.
  username text unique check (username = lower(username)),
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
  account_status account_status not null default 'active',
  created_at timestamptz not null default now(),
  -- Marks accounts created and piloted through the Handler tool
  -- (src/app/handlers) — bookkeeping only, never shown in user-facing UI.
  is_bot boolean not null default false
);

-- display_name can only change once every 48 hours — enforced here (not
-- just in application code) so it holds even against a direct table update,
-- and display_name_changed_at is always trigger-set, never client-supplied.
-- The bypass flag lets admin_set_identity() (below) skip the cooldown for an
-- admin-initiated override — set via set_config's is_local=true, so it's
-- scoped to the current transaction and can't leak into a concurrent
-- session's own update.
create function public.enforce_display_name_cooldown()
returns trigger as $$
begin
  if coalesce(current_setting('app.bypass_display_name_cooldown', true), 'false') = 'true' then
    new.display_name_changed_at := now();
    return new;
  end if;

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

-- Admin-only override for a user's tag/display name, bypassing both the
-- normal RLS "own profile only" restriction (this is a SECURITY DEFINER
-- function, so it runs with the privileges of its owner, not the caller)
-- and the cooldown above. Caller authorization (role = 'admin') is checked
-- in the application layer before this is invoked, same pattern as the
-- mod-approval actions using the service-role client.
create function public.admin_set_identity(
  target_id uuid,
  new_username text,
  new_display_name text
)
returns void as $$
begin
  perform set_config('app.bypass_display_name_cooldown', 'true', true);
  update profiles
  set
    username = coalesce(lower(new_username), username),
    display_name = coalesce(new_display_name, display_name)
  where id = target_id;
end;
$$ language plpgsql security definer set search_path = public;

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

-- ─── STRIKES ─────────────────────────────────────────────────────────────────
-- The real audit trail profiles.strike_count never had — that column is a
-- fast-read cache kept in sync by the trigger below, not the source of truth.
create table strikes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  issued_by uuid not null references profiles(id),
  reason text,
  response_id uuid references responses(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references profiles(id)
);

create function public.increment_strike_count()
returns trigger as $$
begin
  update profiles set strike_count = strike_count + 1 where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger increment_strike_count
  after insert on strikes
  for each row execute procedure increment_strike_count();

-- Mirrors increment_strike_count: revoking a strike is a soft-delete (the
-- row stays, with who/when it was reversed) rather than a real delete, so
-- strike_count needs the matching decrement on the way back down.
create function public.decrement_strike_count()
returns trigger as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    update profiles set strike_count = greatest(strike_count - 1, 0) where id = new.user_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger decrement_strike_count
  after update on strikes
  for each row execute procedure decrement_strike_count();

-- ─── MODERATION LOG ──────────────────────────────────────────────────────────
-- Audit trail for every approve/reject/reversal decision on a response.
create table moderation_log (
  id uuid primary key default uuid_generate_v4(),
  response_id uuid not null references responses(id) on delete cascade,
  moderator_id uuid not null references profiles(id),
  decision moderation_status not null,
  created_at timestamptz not null default now()
);

-- ─── ADMIN ACTIONS (per-user activity log) ──────────────────────────────────
-- Every admin mutation made against a profile (role/status/badges/identity/
-- strikes/streak edits) gets one row here, so the user detail view can show
-- a single chronological "what happened to this account" timeline instead of
-- piecing it together from five different tables.
create table admin_actions (
  id uuid primary key default uuid_generate_v4(),
  target_user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid not null references profiles(id),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(new.raw_user_meta_data ->> 'username'));
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
alter table app_config enable row level security;
alter table strikes enable row level security;
alter table moderation_log enable row level security;
alter table admin_actions enable row level security;

create policy "Authenticated users can view app config" on app_config
  for select to authenticated using (true);

create policy "Admins can update app config" on app_config
  for update to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Users can view their own strikes" on strikes
  for select to authenticated using (user_id = auth.uid());

create policy "Admins can view all strikes" on strikes
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can view moderation log" on moderation_log
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can view admin actions" on admin_actions
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Also hides pool challenges (drop_at is null) from clients entirely, since
-- null <= now() is never true — only the admin (service role) client used by
-- the cron job can see/pick from the pool.
create policy "Dropped challenges are readable" on challenges
  for select using (drop_at <= now());

-- Admins additionally see/write the full pool (not just dropped items) —
-- challenges have only ever been written by the service-role cron/admin
-- client until now; this is for the signed-in admin writing through the UI.
create policy "Admins can view all challenges" on challenges
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can insert challenges" on challenges
  for insert to authenticated with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can update challenges" on challenges
  for update to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

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
-- approved, or while still pending within the admin-configurable grace
-- window (app_config.photo_grace_minutes) — a photo response that never
-- gets moderated just stops matching this policy once its own timestamp
-- ages past the window (no cron needed).
create policy "Responses visible after you've answered that challenge" on responses
  for select to authenticated using (
    has_answered(challenge_id)
    and (
      user_id = auth.uid()
      or moderation_status = 'approved'
      or (
        moderation_status = 'pending'
        and answered_at > now() - ((select photo_grace_minutes from app_config) * interval '1 minute')
      )
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

-- ─── STREAK OVERRIDES ─────────────────────────────────────────────────────────
-- Per-day streak corrections. profiles.current_streak/longest_streak stay the
-- fast-read cache (same pattern as strike_count) — this table is the source
-- of truth admins/mods edit, and src/lib/streak.ts's recomputeStreakForUser()
-- walks it (merged with real responses) to refresh the cache. A row here
-- means "this date's status was manually overridden"; no row means trust the
-- real response for that date.
create table streak_overrides (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  counts boolean not null,
  set_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table streak_overrides enable row level security;

create policy "Admins can view streak overrides" on streak_overrides
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
