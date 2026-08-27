-- A generic "report this" mechanism — starts with profile pictures, built to
-- extend to other user-submitted content later without a schema change:
-- target_type is free text, and target_ref snapshots the reported value
-- (e.g. the avatar_url at report time) since content like avatar_url gets
-- overwritten in place rather than versioned — without the snapshot, a mod
-- reviewing the report later could be looking at a photo the user already
-- replaced.
create type report_status as enum ('pending', 'resolved', 'dismissed');

create table reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null,
  target_ref text,
  reason text,
  status report_status not null default 'pending',
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (reporter_id <> target_user_id)
);

alter table reports enable row level security;

create policy "Users can report content" on reports
  for insert to authenticated with check (reporter_id = auth.uid());

create policy "Mods can view reports" on reports
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role in ('mod', 'admin'))
  );
