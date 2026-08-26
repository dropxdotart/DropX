-- Lets a user retract their own answer without freeing up the challenge slot
-- (the row stays — unique(user_id, challenge_id) still blocks re-answering —
-- it's just hidden from everyone but the owner and logged for admins).
alter table responses add column deleted_at timestamptz;

drop policy "Responses visible after you've answered that challenge" on responses;

create policy "Responses visible after you've answered that challenge" on responses
  for select to authenticated using (
    has_answered(challenge_id)
    and (
      user_id = auth.uid()
      or (
        deleted_at is null
        and (
          moderation_status = 'approved'
          or (
            moderation_status = 'pending'
            and answered_at > now() - ((select photo_grace_minutes from app_config) * interval '1 minute')
          )
        )
      )
    )
  );

-- ─── RESPONSE DELETIONS (audit log) ────────────────────────────────────────────
create table response_deletions (
  id uuid primary key default uuid_generate_v4(),
  response_id uuid not null references responses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table response_deletions enable row level security;

create policy "Admins can view response deletions" on response_deletions
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
