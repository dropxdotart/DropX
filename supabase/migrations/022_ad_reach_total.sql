-- Reach with an overall row: unique players per campaign, plus one row with
-- a null campaign for unique players across all of them (a player who saw
-- two campaigns counts once there).
create or replace function ad_reach(p_from timestamptz, p_to timestamptz, p_campaign uuid)
returns table (campaign_id uuid, reach bigint)
language sql stable
as $$
  select l.campaign_id, count(distinct l.player_id)
  from ad_log l
  where l.event = 'view' and l.created_at >= p_from and l.created_at < p_to
    and (p_campaign is null or l.campaign_id = p_campaign)
  group by grouping sets ((l.campaign_id), ())
$$;
