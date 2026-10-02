-- Totals for the admin dashboard and building stats, computed in the
-- database (API reads are capped at 1000 rows).

create or replace function dashboard_totals()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'returning_week', (
      select count(*) from (
        select player_id from player_sessions
        where started_at >= now() - interval '7 days'
        group by player_id having count(distinct started_at::date) >= 2
      ) r
    ),
    'sessions_week', (select count(*) from player_sessions where started_at >= now() - interval '7 days'),
    'play_seconds_week', (select coalesce(sum(seconds), 0) from player_sessions where started_at >= now() - interval '7 days'),
    'bricks_in_game', (select coalesce(sum(scrap), 0) from players)
  );
$$;
revoke all on function dashboard_totals from public, anon, authenticated;

create or replace function building_stats()
returns table (building text, building_name text, started bigint, finished bigint, avg_seconds double precision, median_seconds double precision)
language sql
stable
security definer
set search_path = public
as $$
  select
    building,
    max(building_name),
    count(*) filter (where kind = 'building_started'),
    count(*) filter (where kind = 'building_finished'),
    avg(seconds) filter (where kind = 'building_finished'),
    percentile_cont(0.5) within group (order by seconds) filter (where kind = 'building_finished')
  from player_events
  group by building;
$$;
revoke all on function building_stats from public, anon, authenticated;
