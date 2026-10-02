-- Admins can reset a player's progress: a 'reset' grant tells the game to
-- wipe its save on its next sync (keeping the player id and username).
alter type reward_kind add value if not exists 'reset';
