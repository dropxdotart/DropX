-- Live sync (lobby roster filling in, round transitions) is driven by
-- Postgres Changes over these three tables — nothing works live without
-- them being in the realtime publication.
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_players;
alter publication supabase_realtime add table rounds;
