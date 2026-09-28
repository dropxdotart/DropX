-- Hosting no longer requires a nickname up front — the name is asked for
-- after picking a game (see GamePicker) — so a visitor to /host who hasn't
-- signed in yet (not even anonymously) still needs to read the games
-- catalog to render the picker. The old policy only granted `authenticated`,
-- which excludes the `anon` role used before any session exists.
drop policy "Anyone can view active games" on games;

create policy "Anyone can view active games" on games
  for select to anon, authenticated using (active);
