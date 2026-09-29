-- An UPDATE policy with only USING (no WITH CHECK) reuses USING as the
-- check on the NEW row too — so reassigning host_id to someone else always
-- failed RLS, since the new row's host_id no longer equals the acting
-- host's own auth.uid(). The WITH CHECK below allows the update either
-- when the room stays with the same host (the common case: status/
-- game_key/current_round_index changes) or when the new host_id is an
-- actual member of the room (a legitimate handoff, not an arbitrary user).
drop policy "Host can update their room" on rooms;
create policy "Host can update their room" on rooms
  for update to authenticated
  using (host_id = auth.uid())
  with check (
    host_id = auth.uid()
    or exists (select 1 from room_players where room_players.room_id = rooms.id and room_players.user_id = host_id)
  );
