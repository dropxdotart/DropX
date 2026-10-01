-- Ad stats and scheduling.
--
-- Scheduling: an ad only shows inside its optional [starts_at, ends_at)
-- window (and only while `active`). The anon read policy enforces it, so
-- the game can't fetch an ad outside its window even if a client asks.
--
-- Stats: the game records view / complete / skip / click events per ad,
-- tagged with an anonymous per-device player id (players never sign in).
-- Events are written through a server action with the service role, so
-- anon gets no direct access to the table at all.

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
