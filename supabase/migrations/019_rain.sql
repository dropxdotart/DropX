-- Rain is an admin thing: for everyone as a 'rain' live event, or for one
-- player as a 'rain' grant (amount = minutes).
alter table live_events drop constraint if exists live_events_kind_check;
alter table live_events add constraint live_events_kind_check check (kind in ('double_bricks', 'crew_boost', 'upgrade_sale', 'double_xp', 'rain'));
alter type reward_kind add value if not exists 'rain';
