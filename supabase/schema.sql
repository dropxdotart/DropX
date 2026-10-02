-- Rubble — an idle demolition game. No player accounts: progress is saved
-- client-side (localStorage), so the only backend surface is the
-- admin-controlled ad system. Writes to `ads` only ever go through the
-- service-role client (see src/lib/supabase/admin.ts) from the shared
-- /admin/* password gate — there's no signed-in "player" role at all here,
-- so the only RLS concern is letting the game itself (anonymous, no
-- session) read which ads are currently active.

create extension if not exists "uuid-ossp";

create type ad_kind as enum ('image', 'video');
create type ad_placement as enum ('rewarded', 'interstitial', 'banner', 'billboard');

create table ads (
  id uuid primary key default uuid_generate_v4(),
  kind ad_kind not null,
  placement ad_placement not null default 'interstitial',
  media_url text not null,
  click_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table ads enable row level security;

-- `anon` (not `authenticated`) — the game never signs anyone in.
create policy "Anyone can view active ads" on ads
  for select to anon using (active);

-- A fresh `create schema public` (this project was rebuilt from a full
-- wipe) doesn't carry over the table-level GRANTs Supabase's own project
-- creation normally sets up — RLS alone isn't enough, Postgres also
-- requires the base privilege or every query 401s with "permission denied"
-- regardless of policy. Re-establishing the standard Supabase baseline here.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;

alter table ads
  add column starts_at timestamptz,
  add column ends_at timestamptz;

drop policy "Anyone can view active ads" on ads;
create policy "Anyone can view live ads" on ads
  for select to anon
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

create table ad_events (
  id bigint generated always as identity primary key,
  ad_id uuid not null references ads (id) on delete cascade,
  event text not null check (event in ('view', 'complete', 'skip', 'click')),
  player_id text not null,
  bricks integer not null default 0 check (bricks >= 0),
  created_at timestamptz not null default now()
);

create index ad_events_ad_time on ad_events (ad_id, created_at);

alter table ad_events enable row level security;
-- Migration 001's default privileges grant anon/authenticated on new
-- tables; this one is service-role only.
revoke all on ad_events from anon, authenticated;

-- Totals per ad since a point in time (the admin's "today" / "7 days" /
-- "all time" toggle passes the start).
create or replace function ad_stats(since timestamptz)
returns table (
  ad_id uuid,
  views bigint,
  uniques bigint,
  completes bigint,
  skips bigint,
  clicks bigint,
  bricks bigint
)
language sql stable
as $$
  select
    e.ad_id,
    count(*) filter (where e.event = 'view'),
    count(distinct e.player_id) filter (where e.event = 'view'),
    count(*) filter (where e.event = 'complete'),
    count(*) filter (where e.event = 'skip'),
    count(*) filter (where e.event = 'click'),
    coalesce(sum(e.bricks) filter (where e.event = 'complete'), 0)
  from ad_events e
  where e.created_at >= since
  group by e.ad_id
$$;

-- Views per ad per day for the last `days` days, bucketed in the admin's
-- time zone, for the little bar charts.
create or replace function ad_daily_views(days integer, tz text)
returns table (ad_id uuid, day date, views bigint)
language sql stable
as $$
  select e.ad_id, (e.created_at at time zone tz)::date, count(*)
  from ad_events e
  where e.event = 'view' and e.created_at >= now() - make_interval(days => days)
  group by 1, 2
$$;

revoke execute on function ad_stats(timestamptz) from public, anon, authenticated;
revoke execute on function ad_daily_views(integer, text) from public, anon, authenticated;
grant execute on function ad_stats(timestamptz) to service_role;
grant execute on function ad_daily_views(integer, text) to service_role;

create table ad_settings (
  placement ad_placement primary key,
  unlock_seconds integer not null check (unlock_seconds between 0 and 120)
);

insert into ad_settings (placement, unlock_seconds) values
  ('interstitial', 10),
  ('rewarded', 15);

alter table ad_settings enable row level security;
create policy "Anyone can read ad settings" on ad_settings for select to anon using (true);
-- Migration 001's default privileges grant writes on new tables; reads only.
revoke insert, update, delete on ad_settings from anon, authenticated;

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
where id = 'ads';

create table ad_media (
  id uuid primary key default uuid_generate_v4(),
  kind ad_kind not null,
  media_url text not null,
  click_url text,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

alter table ad_media enable row level security;
create policy "Anyone can view live media" on ad_media
  for select to anon
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
revoke insert, update, delete on ad_media from anon, authenticated;

-- Each existing ad becomes an upload (same id) assigned to its one type.
-- Its on/off and schedule stay on the assignment; the upload starts on.
insert into ad_media (id, kind, media_url, click_url, created_at)
select id, kind, media_url, click_url, created_at from ads;

alter table ads add column media_id uuid references ad_media (id) on delete cascade;
update ads set media_id = id;
alter table ads alter column media_id set not null;
alter table ads add constraint ads_media_placement unique (media_id, placement);

-- The media fields now live on ad_media. Kept (nullable) until the new
-- admin is deployed so the previous build keeps working; dropped later.
alter table ads alter column kind drop not null;
alter table ads alter column media_url drop not null;

-- Per-upload totals (unique players counted across all its types).
create or replace function ad_media_stats(since timestamptz)
returns table (
  media_id uuid,
  views bigint,
  uniques bigint,
  completes bigint,
  skips bigint,
  clicks bigint,
  bricks bigint
)
language sql stable
as $$
  select
    a.media_id,
    count(*) filter (where e.event = 'view'),
    count(distinct e.player_id) filter (where e.event = 'view'),
    count(*) filter (where e.event = 'complete'),
    count(*) filter (where e.event = 'skip'),
    count(*) filter (where e.event = 'click'),
    coalesce(sum(e.bricks) filter (where e.event = 'complete'), 0)
  from ad_events e
  join ads a on a.id = e.ad_id
  where e.created_at >= since
  group by a.media_id
$$;

revoke execute on function ad_media_stats(timestamptz) from public, anon, authenticated;
grant execute on function ad_media_stats(timestamptz) to service_role;

alter table ads drop column kind, drop column media_url, drop column click_url;

create table players (
  id uuid primary key,
  short_id text not null unique,
  save jsonb,
  scrap double precision not null default 0,
  xp double precision not null default 0,
  level integer not null default 1,
  plots integer not null default 1,
  workers integer not null default 1,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index players_last_seen on players (last_seen desc);

-- What a code or a gift gives. bricks: add `amount` bricks. set_bricks:
-- set the balance to `amount` (admin edits). boost: `amount` minutes of
-- crew boost. upgrade: `amount` free levels of `upgrade`.
create type reward_kind as enum ('bricks', 'set_bricks', 'boost', 'upgrade');

create table player_grants (
  id bigint generated always as identity primary key,
  player_id uuid not null references players (id) on delete cascade,
  kind reward_kind not null,
  amount double precision not null,
  upgrade text,
  message text,
  source text not null default 'admin', -- 'admin' or 'code'
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index player_grants_pending on player_grants (player_id) where applied_at is null;

create table redeem_codes (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique, -- stored uppercase
  kind reward_kind not null check (kind <> 'set_bricks'),
  amount double precision not null check (amount > 0),
  upgrade text,
  max_uses integer check (max_uses is null or max_uses > 0),
  once_per_player boolean not null default true,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table code_redemptions (
  id bigint generated always as identity primary key,
  code_id uuid not null references redeem_codes (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index code_redemptions_code on code_redemptions (code_id);
create index code_redemptions_player on code_redemptions (code_id, player_id);

alter table players enable row level security;
alter table player_grants enable row level security;
alter table redeem_codes enable row level security;
alter table code_redemptions enable row level security;
revoke all on players, player_grants, redeem_codes, code_redemptions from anon, authenticated;

-- Redeeming is one atomic step so "max uses" and "once per player" hold
-- even when many players redeem at once. Returns the reward, or an error
-- message in `error`.
create or replace function redeem_code(p_player uuid, p_code text)
returns table (kind reward_kind, amount double precision, upgrade text, error text)
language plpgsql
as $$
declare
  c redeem_codes%rowtype;
  used integer;
begin
  select * into c from redeem_codes where code = upper(trim(p_code)) for update;
  if not found or not c.active then
    return query select null::reward_kind, null::double precision, null::text, 'That code doesn''t exist';
    return;
  end if;
  if c.expires_at is not null and c.expires_at <= now() then
    return query select null::reward_kind, null::double precision, null::text, 'That code has expired';
    return;
  end if;
  if c.once_per_player and exists (select 1 from code_redemptions r where r.code_id = c.id and r.player_id = p_player) then
    return query select null::reward_kind, null::double precision, null::text, 'You''ve already used that code';
    return;
  end if;
  select count(*) into used from code_redemptions r where r.code_id = c.id;
  if c.max_uses is not null and used >= c.max_uses then
    return query select null::reward_kind, null::double precision, null::text, 'That code has been used up';
    return;
  end if;
  insert into code_redemptions (code_id, player_id) values (c.id, p_player);
  return query select c.kind, c.amount, c.upgrade, null::text;
end;
$$;

revoke execute on function redeem_code(uuid, text) from public, anon, authenticated;
grant execute on function redeem_code(uuid, text) to service_role;

alter table players add column username text;
create unique index players_username_unique on players (lower(username)) where username is not null;

create table banned_words (
  word text primary key, -- stored lowercase
  created_at timestamptz not null default now()
);

alter table banned_words enable row level security;
revoke all on banned_words from anon, authenticated;

alter type reward_kind add value if not exists 'reset';
