-- Admins can set a player's level: a 'set_level' grant sets their XP to the
-- start of that level on their next sync.
alter type reward_kind add value if not exists 'set_level';
