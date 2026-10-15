-- Ads, rebuilt like an ad network: campaigns (who, when, where, to whom,
-- how often) hold creatives (the images/videos), and every impression,
-- click, completion and skip is logged for reports. Everything is read
-- and written server-side with the service role; players never touch
-- these tables directly.

create table ad_campaigns (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  advertiser text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  -- rewarded / interstitial / banner / billboard
  placements text[] not null default '{}',
  headline text not null default '',
  cta_text text not null default 'Learn more',
  cta_url text,
  -- Schedule: a date window, and optionally only some weekdays (0 = Sunday)
  -- and hours [hour_from, hour_to) in the campaign's time zone.
  starts_at timestamptz,
  ends_at timestamptz,
  days smallint[],
  hour_from smallint check (hour_from between 0 and 23),
  hour_to smallint check (hour_to between 1 and 24),
  tz text not null default 'America/New_York',
  -- Limits: per player per day, per day overall, all time (views).
  freq_cap integer check (freq_cap > 0),
  daily_cap integer check (daily_cap > 0),
  total_cap integer check (total_cap > 0),
  -- Audience
  min_level integer check (min_level > 0),
  max_level integer check (max_level > 0),
  islands text[], -- shown only to players who've reached one of these
  audience text not null default 'all' check (audience in ('all', 'new', 'returning')),
  -- When several campaigns could show, higher weight shows more often.
  weight integer not null default 1 check (weight between 1 and 10),
  report_token uuid not null default uuid_generate_v4() unique,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ad_creatives (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references ad_campaigns (id) on delete cascade,
  name text not null default '',
  kind ad_kind not null,
  media_url text not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now()
);
create index ad_creatives_campaign on ad_creatives (campaign_id);

create table ad_log (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references ad_campaigns (id) on delete cascade,
  creative_id uuid references ad_creatives (id) on delete set null,
  placement text not null,
  event text not null check (event in ('view', 'click', 'complete', 'skip')),
  player_id text not null,
  seconds real not null default 0, -- how long a video played (complete / skip)
  bricks integer not null default 0, -- bricks given out for a rewarded ad
  created_at timestamptz not null default now()
);
create index ad_log_campaign_time on ad_log (campaign_id, created_at);
create index ad_log_player_time on ad_log (player_id, created_at);
create index ad_log_time on ad_log (created_at);

alter table ad_campaigns enable row level security;
alter table ad_creatives enable row level security;
alter table ad_log enable row level security;
revoke all on ad_campaigns, ad_creatives, ad_log from anon, authenticated;

-- ── Bring the old library across: one campaign per upload ─────────────

insert into ad_campaigns (id, name, status, placements, cta_url, starts_at, ends_at, created_at)
select
  m.id,
  'Imported ad ' || to_char(m.created_at, 'Mon DD'),
  case when m.active then 'active' else 'paused' end,
  coalesce(array_agg(a.placement::text) filter (where a.placement is not null and a.active), '{}'),
  m.click_url,
  m.starts_at,
  m.ends_at,
  m.created_at
from ad_media m
left join ads a on a.media_id = m.id
group by m.id;

insert into ad_creatives (id, campaign_id, name, kind, media_url, created_at)
select id, id, 'Imported', kind, media_url, created_at from ad_media;

insert into ad_log (campaign_id, creative_id, placement, event, player_id, bricks, created_at)
select a.media_id, a.media_id, a.placement::text, e.event, e.player_id, e.bricks, e.created_at
from ad_events e
join ads a on a.id = e.ad_id;

-- ── Counts for the limits ──────────────────────────────────────────────

-- Views per campaign: all time, today (in each campaign's zone) and today
-- for one player.
create or replace function ad_cap_counts(p_player text)
returns table (campaign_id uuid, total bigint, today bigint, mine_today bigint)
language sql stable
as $$
  select
    c.id,
    (select count(*) from ad_log l where l.campaign_id = c.id and l.event = 'view'),
    (select count(*) from ad_log l where l.campaign_id = c.id and l.event = 'view'
       and l.created_at >= (date_trunc('day', now() at time zone c.tz) at time zone c.tz)),
    (select count(*) from ad_log l where l.campaign_id = c.id and l.event = 'view' and l.player_id = p_player
       and l.created_at >= (date_trunc('day', now() at time zone c.tz) at time zone c.tz))
  from ad_campaigns c
  where c.status = 'active'
$$;

-- ── Reports ────────────────────────────────────────────────────────────

-- Totals by day × campaign × creative × placement in a date range.
create or replace function ad_report(p_from timestamptz, p_to timestamptz, p_campaign uuid, p_tz text)
returns table (
  day date,
  campaign_id uuid,
  creative_id uuid,
  placement text,
  views bigint,
  clicks bigint,
  completes bigint,
  skips bigint,
  watch_seconds double precision,
  bricks bigint
)
language sql stable
as $$
  select
    (l.created_at at time zone p_tz)::date,
    l.campaign_id,
    l.creative_id,
    l.placement,
    count(*) filter (where l.event = 'view'),
    count(*) filter (where l.event = 'click'),
    count(*) filter (where l.event = 'complete'),
    count(*) filter (where l.event = 'skip'),
    coalesce(sum(l.seconds) filter (where l.event in ('complete', 'skip')), 0),
    coalesce(sum(l.bricks) filter (where l.event = 'complete'), 0)
  from ad_log l
  where l.created_at >= p_from and l.created_at < p_to
    and (p_campaign is null or l.campaign_id = p_campaign)
  group by 1, 2, 3, 4
$$;

-- Unique players reached per campaign in a date range.
create or replace function ad_reach(p_from timestamptz, p_to timestamptz, p_campaign uuid)
returns table (campaign_id uuid, reach bigint)
language sql stable
as $$
  select l.campaign_id, count(distinct l.player_id)
  from ad_log l
  where l.event = 'view' and l.created_at >= p_from and l.created_at < p_to
    and (p_campaign is null or l.campaign_id = p_campaign)
  group by 1
$$;

revoke execute on function ad_cap_counts(text) from public, anon, authenticated;
revoke execute on function ad_report(timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
revoke execute on function ad_reach(timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function ad_cap_counts(text) to service_role;
grant execute on function ad_report(timestamptz, timestamptz, uuid, text) to service_role;
grant execute on function ad_reach(timestamptz, timestamptz, uuid) to service_role;
