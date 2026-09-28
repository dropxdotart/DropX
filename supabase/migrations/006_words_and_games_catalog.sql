-- ─── BANNED WORDS ────────────────────────────────────────────────────────────
-- A simple, admin-editable blocklist checked against a chosen nickname
-- (case-insensitive substring match — see claimNickname in
-- src/app/actions.ts). Never exposed to players for read (no RLS select
-- policy at all) — the check happens server-side through the service-role
-- client, same as every other /admin/* tool, so the list itself can't be
-- enumerated by querying the table directly.
create table banned_words (
  id uuid primary key default uuid_generate_v4(),
  word text not null unique,
  created_at timestamptz not null default now()
);

alter table banned_words enable row level security;

-- ─── GAMES CATALOG ───────────────────────────────────────────────────────────
-- Replaces the hardcoded GAMES array in GamePicker — what shows up when
-- hosting, in what order, whether it's actually playable yet, and whether
-- it's a paid game, all admin-editable (src/app/admin/games) instead of a
-- code change. `key` is what the rest of the app already calls this format
-- (round_type's values) — kept as free text here rather than reusing the
-- round_type enum, since a games-catalog row can exist (and be marked
-- "coming soon") before its round type has any real gameplay built.
create table games (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  label text not null,
  description text not null,
  icon text not null default '🎮',
  sort_order int not null default 0,
  available boolean not null default false,
  is_paid boolean not null default false,
  price_cents int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into games (key, label, description, icon, sort_order, available) values
  ('hot_take', 'Hot Take', 'Vote agree or disagree, see the split live.', '🔥', 0, true),
  ('who_said_it', 'Who Said It', 'Answer anonymously, guess who wrote what.', '❓', 1, false),
  ('caption', 'Caption This', 'Caption a photo, vote for the funniest.', '🖼️', 2, false);

alter table games enable row level security;

create policy "Anyone can view active games" on games
  for select to authenticated using (active);
