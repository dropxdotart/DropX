-- Bug fix: an UPDATE policy with only `using` (no `with check`) implicitly
-- reuses `using` to validate the *new* row too. Since the mod policy's
-- `using` required moderation_status = 'pending', the mod's own update (which
-- changes status AWAY from pending) failed against its own policy — "new row
-- violates row-level security policy for table responses" on every
-- approve/deny attempt. Split it into a `using` (which rows a mod may touch:
-- only pending ones) and a separate, permissive `with check` (the resulting
-- row just needs to still belong to a mod/admin action, not stay pending).
drop policy "Mods can moderate pending responses" on responses;

create policy "Mods can moderate pending responses" on responses
  for update to authenticated
  using (
    moderation_status = 'pending'
    and exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  );
