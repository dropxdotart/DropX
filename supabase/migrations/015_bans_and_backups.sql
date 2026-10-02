-- Bans (temporary or permanent, with a reason the player sees) and save
-- backups taken right before every admin change to a player, so a mistake
-- can be undone by restoring one.

alter table players
  add column if not exists ban_until timestamptz,
  add column if not exists ban_permanent boolean not null default false,
  add column if not exists ban_reason text;

create table player_backups (
  id bigint generated always as identity primary key,
  player_id uuid not null references players (id) on delete cascade,
  save jsonb,
  scrap double precision not null default 0,
  xp double precision not null default 0,
  level integer not null default 1,
  reason text not null, -- the admin change it was taken before
  created_at timestamptz not null default now()
);
create index player_backups_player on player_backups (player_id, created_at desc);
alter table player_backups enable row level security;
revoke all on player_backups from anon, authenticated;

-- A restore replaces the game's save with the one in `data`.
alter type reward_kind add value if not exists 'restore';
alter table player_grants add column if not exists data jsonb;
