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
