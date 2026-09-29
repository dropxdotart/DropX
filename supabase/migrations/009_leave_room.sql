-- No policy currently lets a player remove themselves from a room at all —
-- "Not you?" in the navbar forgot the identity but left a phantom
-- room_players row behind. Self-serve leave, mirroring the existing
-- self-serve join policy.
create policy "Users can leave a room as themselves" on room_players
  for delete to authenticated using (user_id = auth.uid());
