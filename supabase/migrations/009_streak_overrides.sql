-- Per-day streak corrections. profiles.current_streak/longest_streak stay
-- the fast-read cache (same pattern as strike_count) — this table is the
-- source of truth admins/mods edit, and src/lib/streak.ts's
-- recomputeStreakForUser() walks it (merged with real responses) to refresh
-- the cache. A row here means "this date's status was manually overridden";
-- no row means trust the real response for that date.
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
