-- The old ad library, replaced by campaigns (020). Applied once the new
-- code is live, so the running game never loses its ads.
-- Events the old game logged after 020 ran come across first.
insert into ad_log (campaign_id, creative_id, placement, event, player_id, bricks, created_at)
select a.media_id, a.media_id, a.placement::text, e.event, e.player_id, e.bricks, e.created_at
from ad_events e
join ads a on a.id = e.ad_id
where e.created_at > (select coalesce(max(created_at), 'epoch') from ad_log)
  and exists (select 1 from ad_campaigns c where c.id = a.media_id);

drop function if exists ad_stats(timestamptz);
drop function if exists ad_daily_views(integer, text);
drop function if exists ad_media_stats(timestamptz);
drop function if exists ad_media_daily_views(integer, text);
drop table ad_events;
drop table ads;
drop table ad_media;

