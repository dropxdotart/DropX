-- Lets any user pitch a challenge idea — text + a rough type, not a fully
-- specified challenge (choices/correct answer stay admin-authored, so a
-- submitter can't inject a bogus "correct" answer). Shown to admins on
-- /admin/challenges as a read-only "Coming soon" list with author + date;
-- turning one into a real challenge is a manual step through the existing
-- New Challenge form, not an automated conversion.
create table challenge_ideas (
  id uuid primary key default uuid_generate_v4(),
  submitted_by uuid not null references profiles(id) on delete cascade,
  type challenge_type not null,
  idea text not null check (char_length(idea) between 1 and 300),
  created_at timestamptz not null default now()
);

alter table challenge_ideas enable row level security;

create policy "Users can submit challenge ideas" on challenge_ideas
  for insert to authenticated with check (submitted_by = auth.uid());

create policy "Users can view their own challenge ideas" on challenge_ideas
  for select to authenticated using (submitted_by = auth.uid());

create policy "Admins can view all challenge ideas" on challenge_ideas
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
