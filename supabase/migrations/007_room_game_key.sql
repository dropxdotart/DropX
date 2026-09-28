-- Threads the chosen game through room creation instead of every room
-- silently being a hot_take room. References games.key (not id) since
-- that's already the identifier used throughout the app (round_type
-- values, GamePicker, the content banks in room/actions.ts).
alter table rooms add column game_key text not null default 'hot_take' references games (key);
