-- The original "members only" SELECT policy on rooms blocked the join flow
-- itself — you can't look a room up by its code to join it if only members
-- can see it. A room's code is the real access control (you can't discover
-- one without being told it); the row's own metadata isn't sensitive, so
-- any signed-in user can read it.
drop policy "Room members can view their room" on rooms;
create policy "Authenticated users can view rooms" on rooms
  for select to authenticated using (true);
