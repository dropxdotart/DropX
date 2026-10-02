-- Usernames (no sign-in): unique regardless of case, set from the game's
-- Profile sheet or by an admin. Names are checked against a built-in list
-- of offensive words (in code) plus `banned_words`, which admins manage.

alter table players add column username text;
create unique index players_username_unique on players (lower(username)) where username is not null;

create table banned_words (
  word text primary key, -- stored lowercase
  created_at timestamptz not null default now()
);

alter table banned_words enable row level security;
revoke all on banned_words from anon, authenticated;
