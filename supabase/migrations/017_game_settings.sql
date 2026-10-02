-- Game-wide settings an admin edits (first: the balance sliders under
-- key 'tuning', percentages of the built-in numbers). Sent to games on sync.
create table game_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table game_settings enable row level security;
revoke all on game_settings from anon, authenticated;
