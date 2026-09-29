-- There was no DELETE policy on rooms at all. Scoped to "the room is
-- already empty" rather than "you're the host" — the last person leaving
-- has, by definition, just removed themselves from room_players, so they
-- can no longer pass an is_in_room()-style check; anyone can trigger this
-- delete, but it only ever matches a room with zero players left in it.
create policy "Anyone can delete an empty room" on rooms
  for delete to authenticated using (
    not exists (select 1 from room_players where room_players.room_id = rooms.id)
  );
