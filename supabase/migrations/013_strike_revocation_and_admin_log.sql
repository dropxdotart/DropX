-- Lets admins revoke a strike without deleting the record — the original
-- issuance stays visible alongside who reversed it and when, mirroring how
-- response deletions are soft-deleted rather than dropped.
alter table strikes add column revoked_at timestamptz;
alter table strikes add column revoked_by uuid references profiles(id);

-- Mirrors increment_strike_count: revoking a strike is a soft-delete (the
-- row stays, with who/when it was reversed) rather than a real delete, so
-- strike_count needs the matching decrement on the way back down.
create function public.decrement_strike_count()
returns trigger as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    update profiles set strike_count = greatest(strike_count - 1, 0) where id = new.user_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger decrement_strike_count
  after update on strikes
  for each row execute procedure decrement_strike_count();

-- ─── ADMIN ACTIONS (per-user activity log) ──────────────────────────────────
-- Every admin mutation made against a profile (role/status/badges/identity/
-- strikes/streak edits) gets one row here, so the user detail view can show
-- a single chronological "what happened to this account" timeline instead of
-- piecing it together from five different tables.
create table admin_actions (
  id uuid primary key default uuid_generate_v4(),
  target_user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid not null references profiles(id),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table admin_actions enable row level security;

create policy "Admins can view admin actions" on admin_actions
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
