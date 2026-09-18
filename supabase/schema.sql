-- Extensions
create extension if not exists "uuid-ossp";

-- ─── TYPES ───────────────────────────────────────────────────────────────────
create type drop_type as enum ('hot_take', 'caption', 'dare');
create type drop_status as enum ('draft', 'confirmed');
create type user_role as enum ('user', 'mod', 'admin');
create type moderation_status as enum ('pending', 'approved', 'rejected');
create type account_status as enum ('active', 'suspended', 'banned');
create type report_status as enum ('pending', 'resolved', 'dismissed');

-- ─── APP CONFIG ──────────────────────────────────────────────────────────────
-- Singleton row (the boolean PK + check forces exactly one) — the drop
-- window and moderation grace period are admin-editable, not hardcoded
-- constants.
create table app_config (
  id boolean primary key default true check (id),
  drop_window_start_hour int not null default 12,
  drop_window_end_hour int not null default 19,
  moderation_grace_minutes int not null default 10,
  updated_at timestamptz not null default now()
);
insert into app_config (id) values (true);

-- ─── DROPS ───────────────────────────────────────────────────────────────────
-- One row per daily drop, whichever of the three rotating formats it is —
-- `type` decides which *_details / *_responses table actually has content
-- for it. `drop_at` is null while a drop sits in the pool, and is filled in
-- by the daily drop job (see /api/cron/drop) once it's picked and given a
-- random moment inside the day's window — that keeps the exact drop time
-- unknown until it actually happens (see RLS below). `scheduled_date`, when
-- set, tells the drop job to prefer this drop for that specific date
-- instead of picking randomly from the pool. Draft until explicitly
-- confirmed; only confirmed drops are schedulable/pushable (enforced in
-- application code, mirrored in findTodaysDrop's own status filter).
create table drops (
  id uuid primary key default uuid_generate_v4(),
  type drop_type not null,
  prompt text not null,
  drop_at timestamptz unique,
  scheduled_date date unique,
  status drop_status not null default 'draft',
  created_at timestamptz not null default now()
);

-- ─── HOT TAKE ────────────────────────────────────────────────────────────────
-- A two-sided take ("Agree" / "Disagree", or a custom pair like "Cats" /
-- "Dogs") — no moderation, no right answer, just an instant vote and a
-- crowd-split reveal. The reveal being spoiler-free (don't show the split
-- until you've voted) is a client-side UX choice, not an RLS rule — there's
-- nothing sensitive in an aggregate vote count worth enforcing server-side.
create table hot_take_details (
  drop_id uuid primary key references drops(id) on delete cascade,
  option_a text not null,
  option_b text not null
);

create table hot_take_votes (
  id uuid primary key default uuid_generate_v4(),
  drop_id uuid not null references drops(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  choice text not null check (choice in ('a', 'b')),
  voted_at timestamptz not null default now(),
  unique (drop_id, user_id)
);

-- ─── CAPTION ─────────────────────────────────────────────────────────────────
-- A prompt image everyone captions; no correct answer, mods rate 1-10
-- instead of grading right/wrong (see moderation_log below).
create table caption_details (
  drop_id uuid primary key references drops(id) on delete cascade,
  image_url text not null
);

create table caption_responses (
  id uuid primary key default uuid_generate_v4(),
  drop_id uuid not null references drops(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  caption text not null check (char_length(caption) between 1 and 300),
  moderation_status moderation_status not null default 'pending',
  rating int check (rating between 1 and 10),
  submitted_at timestamptz not null default now(),
  -- A retracted caption stays in place (unique(drop_id, user_id) still
  -- blocks recapturing that drop) but is hidden from everyone but the
  -- owner — see the "visible after you've captioned" policy below.
  deleted_at timestamptz,
  unique (drop_id, user_id)
);

-- ─── DARE ────────────────────────────────────────────────────────────────────
-- A physical dare proven on video — target_reps/exercise_label drive the
-- in-app live rep-counter's UI copy ("do 10 pushups") when the dare is
-- rep-based; both are null for a non-rep dare ("text an old friend").
-- counted_reps is the client-side pose-detection tally, reported alongside
-- the video for a mod to sanity-check, not independently verified server
-- side (there's no way to verify a raw camera feed after the fact).
create table dare_details (
  drop_id uuid primary key references drops(id) on delete cascade,
  exercise_label text,
  target_reps int
);

create table dare_submissions (
  id uuid primary key default uuid_generate_v4(),
  drop_id uuid not null references drops(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  video_url text not null,
  counted_reps int,
  moderation_status moderation_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (drop_id, user_id)
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
  avatar_url text,
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

-- ─── AVATAR PRESETS ──────────────────────────────────────────────────────────
-- Admin-curated avatar options a user can pick instead of uploading their own
-- photo. Images live in the avatars storage bucket under presets/ — uploads
-- there go through the admin (service-role) client, exempt from the
-- per-user-folder storage RLS that scopes normal avatar uploads.
create table avatar_presets (
  id uuid primary key default uuid_generate_v4(),
  image_url text not null,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── REPORTS ─────────────────────────────────────────────────────────────────
-- A generic "report this" mechanism — starts with profile pictures, built to
-- extend to other user-submitted content later without a schema change:
-- target_type is free text, and target_ref snapshots the reported value
-- (e.g. the avatar_url at report time) since content like avatar_url gets
-- overwritten in place rather than versioned — without the snapshot, a mod
-- reviewing the report later could be looking at a photo the user already
-- replaced.
create table reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null,
  target_ref text,
  reason text,
  status report_status not null default 'pending',
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (reporter_id <> target_user_id)
);

-- ─── LIKES (generic across caption/dare content) ───────────────────────────
-- Polymorphic, same shape reports/strikes use — "like this post" is the same
-- action regardless of which of the two moderated formats it targets. Hot
-- takes aren't likeable (a vote isn't a post); only caption_response/
-- dare_submission rows are.
create table likes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('caption_response', 'dare_submission')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
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
-- target_type/target_id optionally point at the caption/dare/avatar the
-- strike was issued for (polymorphic, no FK — same reasoning as reports).
create table strikes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  issued_by uuid not null references profiles(id),
  reason text,
  target_type text,
  target_id uuid,
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

-- ─── MODERATION LOG (generic) ────────────────────────────────────────────────
-- Audit trail for every rate/approve/reject/reversal decision on a caption
-- or dare submission — polymorphic for the same reason likes/strikes are.
create table moderation_log (
  id uuid primary key default uuid_generate_v4(),
  target_type text not null check (target_type in ('caption_response', 'dare_submission')),
  target_id uuid not null,
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
alter table drops enable row level security;
alter table hot_take_details enable row level security;
alter table hot_take_votes enable row level security;
alter table caption_details enable row level security;
alter table caption_responses enable row level security;
alter table dare_details enable row level security;
alter table dare_submissions enable row level security;
alter table profiles enable row level security;
alter table likes enable row level security;
alter table follows enable row level security;
alter table app_config enable row level security;
alter table strikes enable row level security;
alter table moderation_log enable row level security;
alter table admin_actions enable row level security;
alter table avatar_presets enable row level security;
alter table reports enable row level security;

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

create policy "Users can view active avatar presets" on avatar_presets
  for select to authenticated using (active);

create policy "Admins can view all avatar presets" on avatar_presets
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Users can report content" on reports
  for insert to authenticated with check (reporter_id = auth.uid());

create policy "Mods can view reports" on reports
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

-- Hides pool/undropped drops from clients entirely (null <= now() is never
-- true) — only the admin (service role) client sees/picks from the pool.
create policy "Dropped drops are readable" on drops
  for select using (drop_at <= now());

create policy "Admins can view all drops" on drops
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can insert drops" on drops
  for insert to authenticated with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can update drops" on drops
  for update to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- *_details rows inherit their parent drop's own visibility rule.
create policy "Hot take details visible with their drop" on hot_take_details
  for select to authenticated using (exists (select 1 from drops d where d.id = drop_id));
create policy "Admins manage hot take details" on hot_take_details
  for all to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Caption details visible with their drop" on caption_details
  for select to authenticated using (exists (select 1 from drops d where d.id = drop_id));
create policy "Admins manage caption details" on caption_details
  for all to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Dare details visible with their drop" on dare_details
  for select to authenticated using (exists (select 1 from drops d where d.id = drop_id));
create policy "Admins manage dare details" on dare_details
  for all to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Hot take votes: no spoiler gate (see comment on hot_take_votes above) —
-- any signed-in user can read every vote, cast exactly one of their own.
create policy "Anyone can view hot take votes" on hot_take_votes
  for select to authenticated using (true);
create policy "Users can cast their own vote" on hot_take_votes
  for insert to authenticated with check (user_id = auth.uid());

-- A caption/dare response is visible to another viewer only once the viewer
-- has participated in that same drop themselves (keeps the feed
-- spoiler-free for whichever drop is still live) — routed through a
-- security-definer function rather than a plain subquery on the same table,
-- because a same-table subquery re-triggers this policy and recurses
-- infinitely.
create function has_captioned(target_drop_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from caption_responses
    where drop_id = target_drop_id
    and user_id = auth.uid()
  );
$$;

create policy "Captions visible after you've captioned that drop" on caption_responses
  for select to authenticated using (
    has_captioned(drop_id)
    and (
      user_id = auth.uid()
      or (
        deleted_at is null
        and (
          moderation_status = 'approved'
          or (
            moderation_status = 'pending'
            and submitted_at > now() - ((select moderation_grace_minutes from app_config) * interval '1 minute')
          )
        )
      )
    )
  );

create policy "Mods can view all pending captions" on caption_responses
  for select to authenticated using (
    moderation_status = 'pending'
    and exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

-- The `moderation_status = 'pending'` guard here (mirrored in the app's own
-- UPDATE ... WHERE clause) is what makes concurrent moderation from multiple
-- mods race-safe: whichever request's row lock commits first flips the
-- status, so the second one's WHERE clause (and this policy) no longer
-- match the row. `using` and `with check` are deliberately different —  an
-- UPDATE policy with only `using` implicitly reuses it as the check too,
-- which would reject the mod's own update for moving status away from
-- 'pending' (the entire point of moderating something).
create policy "Mods can rate pending captions" on caption_responses
  for update to authenticated
  using (
    moderation_status = 'pending'
    and exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

create policy "Users can submit their own caption" on caption_responses
  for insert to authenticated with check (auth.uid() = user_id);

-- Dare submissions: identical shape to captions, mirrored for its own table
-- (can't share one function across two different underlying tables).
create function has_dared(target_drop_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from dare_submissions
    where drop_id = target_drop_id
    and user_id = auth.uid()
  );
$$;

create policy "Dares visible after you've submitted that drop" on dare_submissions
  for select to authenticated using (
    has_dared(drop_id)
    and (
      user_id = auth.uid()
      or (
        deleted_at is null
        and (
          moderation_status = 'approved'
          or (
            moderation_status = 'pending'
            and submitted_at > now() - ((select moderation_grace_minutes from app_config) * interval '1 minute')
          )
        )
      )
    )
  );

create policy "Mods can view all pending dares" on dare_submissions
  for select to authenticated using (
    moderation_status = 'pending'
    and exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

create policy "Mods can moderate pending dares" on dare_submissions
  for update to authenticated
  using (
    moderation_status = 'pending'
    and exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

create policy "Users can submit their own dare" on dare_submissions
  for insert to authenticated with check (auth.uid() = user_id);

-- Profiles (username/badges/role) are visible to any signed-in user so the
-- feed can show who answered what.
create policy "Authenticated users can view profiles" on profiles
  for select to authenticated using (true);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- Likes: visibility mirrors whichever target table the like points at —
-- checked per target_type since there's no single FK to join through.
create policy "Likes visible for visible content" on likes
  for select to authenticated using (
    (target_type = 'caption_response' and exists (select 1 from caption_responses r where r.id = target_id))
    or (target_type = 'dare_submission' and exists (select 1 from dare_submissions r where r.id = target_id))
  );

create policy "Users can like visible content" on likes
  for insert to authenticated with check (
    user_id = auth.uid()
    and (
      (target_type = 'caption_response' and exists (select 1 from caption_responses r where r.id = target_id))
      or (target_type = 'dare_submission' and exists (select 1 from dare_submissions r where r.id = target_id))
    )
  );

create policy "Users can unlike their own like" on likes
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
-- walks it (merged with real participation across all three drop-response
-- tables) to refresh the cache. A row here means "this date's status was
-- manually overridden"; no row means trust the real participation for that
-- date.
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
