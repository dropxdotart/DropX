-- Ads admin becomes a media library: an upload (ad_media) can be assigned
-- to several ad types. Each assignment is a row in `ads` (media_id +
-- placement) with its own on/off switch and schedule; the upload has a
-- master switch and schedule too, and an ad only shows when both are live.
-- Stats (ad_events) stay keyed by assignment, so each type keeps its own
-- numbers and totals are summed per upload.

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
