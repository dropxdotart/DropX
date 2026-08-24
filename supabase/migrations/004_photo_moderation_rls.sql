-- Replace the spoiler-gate policy so it also folds in photo moderation
-- visibility: your own responses are always visible to you; others' are
-- visible once approved, or while still pending within a 10-minute grace
-- window (self-expiring — no cron needed, it just stops matching once the
-- row's own timestamp ages past the window).
drop policy "Responses visible after you've answered that challenge" on responses;

create policy "Responses visible after you've answered that challenge" on responses
  for select to authenticated using (
    has_answered(challenge_id)
    and (
      user_id = auth.uid()
      or moderation_status = 'approved'
      or (moderation_status = 'pending' and answered_at > now() - interval '10 minutes')
    )
  );

-- Mods/admins need to see every pending photo regardless of the spoiler
-- gate above (they may not have personally answered that challenge).
create policy "Mods can view all pending responses" on responses
  for select to authenticated using (
    moderation_status = 'pending'
    and exists (
      select 1 from profiles
      where id = auth.uid() and role in ('mod', 'admin')
    )
  );

-- Mods/admins can decide a pending item exactly once — the `moderation_status
-- = 'pending'` guard here (mirrored in the application's own UPDATE ... WHERE
-- clause) is what makes concurrent approve/deny from two mods race-safe:
-- whichever request's row lock commits first flips the status, so the
-- second one's WHERE clause (and this policy) no longer match the row.
create policy "Mods can moderate pending responses" on responses
  for update to authenticated using (
    moderation_status = 'pending'
    and exists (
      select 1 from profiles
      where id = auth.uid() and role in ('mod', 'admin')
    )
  );
