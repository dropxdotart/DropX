-- Schema reset — the app is being rebuilt from scratch as a real-time party
-- game (rooms, live rounds: hot takes / who-said-it / caption-a-meme)
-- instead of the old daily-drop challenge model. The database itself has
-- already been fully wiped (every table, type, function, and user account —
-- pre-launch, no real user data existed). This file is empty on purpose
-- until the new schema is designed; migrations start over at 001.
create extension if not exists "uuid-ossp";
