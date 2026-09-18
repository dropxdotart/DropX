-- Carries over the old "retract your own answer" feature onto the two
-- feed-visible response types (hot take votes have no feed presence, so
-- there's nothing to retract there). admin_actions already logs the
-- "answer_deleted" event on its own (see src/app/actions.ts), so this skips
-- recreating the old dedicated response_deletions audit table — one log is
-- enough.
drop table if exists response_deletions cascade;

alter table caption_responses add column deleted_at timestamptz;
alter table dare_submissions add column deleted_at timestamptz;

drop policy "Captions visible after you've captioned that drop" on caption_responses;
create policy "Captions visible after you've captioned that drop" on caption_responses
  for select to authenticated using (
    has_captioned(drop_id)
    and (
      user_id = auth.uid()
      or (
        deleted_at is null
        and (
          moderation_status = 'approved'
          or (
            moderation_status = 'pending'
            and submitted_at > now() - ((select moderation_grace_minutes from app_config) * interval '1 minute')
          )
        )
      )
    )
  );

drop policy "Dares visible after you've submitted that drop" on dare_submissions;
create policy "Dares visible after you've submitted that drop" on dare_submissions
  for select to authenticated using (
    has_dared(drop_id)
    and (
      user_id = auth.uid()
      or (
        deleted_at is null
        and (
          moderation_status = 'approved'
          or (
            moderation_status = 'pending'
            and submitted_at > now() - ((select moderation_grace_minutes from app_config) * interval '1 minute')
          )
        )
      )
    )
  );
