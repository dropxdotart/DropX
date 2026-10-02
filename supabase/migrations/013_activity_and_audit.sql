-- Player activity (kept 90 days) and the admin audit log.
--
-- Deliberately small: visits (one row per play session) and building
-- starts/finishes. No personal info — players are anonymous device ids.
-- Gifts, codes and ad views are already in player_grants / ad_events.

alter table players
  add column if not exists play_seconds double precision not null default 0,
  add column if not exists sites_cleared integer not null default 0;

create table player_sessions (
  id uuid primary key, -- made by the game for each visit
  player_id uuid not null references players (id) on delete cascade,
  started_at timestamptz not null,
  last_seen timestamptz not null default now(),
  seconds double precision not null default 0 check (seconds >= 0)
);
create index player_sessions_player on player_sessions (player_id, started_at desc);
create index player_sessions_time on player_sessions (started_at);

create table player_events (
  id bigint generated always as identity primary key,
  player_id uuid not null references players (id) on delete cascade,
  kind text not null check (kind in ('building_started', 'building_finished')),
  building text not null,
  building_name text not null,
  seconds double precision, -- time it took (finished only)
  created_at timestamptz not null default now()
);
create index player_events_player on player_events (player_id, created_at desc);
create index player_events_building on player_events (building, kind);

create table admin_audit (
  id bigint generated always as identity primary key,
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_time on admin_audit (created_at desc);

alter table player_sessions enable row level security;
alter table player_events enable row level security;
alter table admin_audit enable row level security;
revoke all on player_sessions, player_events, admin_audit from anon, authenticated;

-- Records a visit's running length and adds the new time to the player's
-- total (which outlives the 90-day cleanup).
create or replace function record_session(p_player uuid, p_session uuid, p_started timestamptz, p_seconds double precision)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prev double precision;
  secs double precision := greatest(0, least(p_seconds, 86400));
begin
  select seconds into prev from player_sessions where id = p_session and player_id = p_player for update;
  if prev is null then
    insert into player_sessions (id, player_id, started_at, last_seen, seconds)
    values (p_session, p_player, least(p_started, now()), now(), secs)
    on conflict (id) do nothing;
    prev := 0;
  else
    update player_sessions set seconds = greatest(seconds, secs), last_seen = now() where id = p_session;
  end if;
  update players set play_seconds = play_seconds + greatest(0, secs - prev) where id = p_player;
end;
$$;
revoke all on function record_session from public, anon, authenticated;

-- Drops activity older than 90 days (run from the admin dashboard).
create or replace function prune_activity()
returns void
language sql
security definer
set search_path = public
as $$
  delete from player_sessions where started_at < now() - interval '90 days';
  delete from player_events where created_at < now() - interval '90 days';
$$;
revoke all on function prune_activity from public, anon, authenticated;
