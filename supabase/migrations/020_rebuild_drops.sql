-- Full rebuild of the daily-activity data model, replacing the generic
-- multiple_choice/text/photo "challenge" concept with three fixed rotating
-- formats: hot takes, caption battles, and dares. Pre-launch, no real user
-- data exists yet (see feedback_schema_changes_pre_launch memory) — this is
-- a clean cutover, not a migration that preserves old rows.

-- ─── Drop the old challenge/response layer ─────────────────────────────────
drop table if exists moderation_log cascade;
drop table if exists comments cascade;
drop table if exists likes cascade;
alter table strikes drop column if exists response_id;
drop table if exists responses cascade;
drop function if exists has_answered(uuid);
drop table if exists challenge_ideas cascade;
drop table if exists challenges cascade;
drop type if exists challenge_type;

alter table app_config rename column photo_grace_minutes to moderation_grace_minutes;

-- ─── DROPS ───────────────────────────────────────────────────────────────────
-- One row per daily drop, whichever of the three formats it is that day —
-- `type` decides which *_details / *_responses table actually has content.
-- drop_at/scheduled_date/status keep the exact same pool → scheduled →
-- dropped lifecycle the old challenges table had.
create type drop_type as enum ('hot_take', 'caption', 'dare');
create type drop_status as enum ('draft', 'confirmed');

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
-- instead (see moderation_log below) — same shape the old "ungraded text"
-- challenges had, just promoted to a first-class daily format.
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
  unique (drop_id, user_id)
);

-- ─── LIKES (generic across caption/dare content) ───────────────────────────
-- Polymorphic like reports/strikes already use this shape for — no per-type
-- like table, since "like this post" is the same action regardless of which
-- of the two moderated formats it targets. Hot takes aren't likeable (a
-- vote isn't a post); only caption_response/dare_submission rows are.
create table likes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('caption_response', 'dare_submission')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

-- ─── MODERATION LOG (generic) ────────────────────────────────────────────────
create table moderation_log (
  id uuid primary key default uuid_generate_v4(),
  target_type text not null check (target_type in ('caption_response', 'dare_submission')),
  target_id uuid not null,
  moderator_id uuid not null references profiles(id),
  decision moderation_status not null,
  created_at timestamptz not null default now()
);

-- strikes needs a polymorphic replacement for the response_id column just
-- dropped above, so a strike can still reference the caption/dare/avatar
-- it was issued for.
alter table strikes add column target_type text;
alter table strikes add column target_id uuid;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table drops enable row level security;
alter table hot_take_details enable row level security;
alter table hot_take_votes enable row level security;
alter table caption_details enable row level security;
alter table caption_responses enable row level security;
alter table dare_details enable row level security;
alter table dare_submissions enable row level security;
alter table likes enable row level security;
alter table moderation_log enable row level security;

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

-- Caption responses: same spoiler-until-you've-participated shape the old
-- responses table used, routed through a security-definer function for the
-- same self-recursion reason has_answered was (see git history).
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
      or moderation_status = 'approved'
      or (
        moderation_status = 'pending'
        and submitted_at > now() - ((select moderation_grace_minutes from app_config) * interval '1 minute')
      )
    )
  );

create policy "Mods can view all pending captions" on caption_responses
  for select to authenticated using (
    moderation_status = 'pending'
    and exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  );

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
-- (see caption's has_captioned comment for why this can't be one shared
-- function across two different underlying tables).
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
      or moderation_status = 'approved'
      or (
        moderation_status = 'pending'
        and submitted_at > now() - ((select moderation_grace_minutes from app_config) * interval '1 minute')
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

create policy "Admins can view moderation log" on moderation_log
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
