-- ─── APP CONFIG ──────────────────────────────────────────────────────────────
-- Singleton row (the boolean PK + check forces exactly one) so the drop
-- window and photo grace period stop being hardcoded constants.
create table app_config (
  id boolean primary key default true check (id),
  drop_window_start_hour int not null default 12,
  drop_window_end_hour int not null default 19,
  photo_grace_minutes int not null default 10,
  updated_at timestamptz not null default now()
);
insert into app_config (id) values (true);

alter table app_config enable row level security;

create policy "Authenticated users can view app config" on app_config
  for select to authenticated using (true);

create policy "Admins can update app config" on app_config
  for update to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ─── ACCOUNT STATUS ──────────────────────────────────────────────────────────
create type account_status as enum ('active', 'suspended', 'banned');

alter table profiles
  add column account_status account_status not null default 'active';

-- ─── STRIKES ─────────────────────────────────────────────────────────────────
-- The real audit trail profiles.strike_count never had — that column becomes
-- a fast-read cache, kept in sync by the trigger below, rather than the
-- source of truth.
create table strikes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  issued_by uuid not null references profiles(id),
  reason text,
  response_id uuid references responses(id) on delete set null,
  created_at timestamptz not null default now()
);

create function public.increment_strike_count()
returns trigger as $$
begin
  update profiles set strike_count = strike_count + 1 where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger increment_strike_count
  after insert on strikes
  for each row execute procedure increment_strike_count();

alter table strikes enable row level security;

create policy "Users can view their own strikes" on strikes
  for select to authenticated using (user_id = auth.uid());

create policy "Admins can view all strikes" on strikes
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ─── MODERATION LOG ──────────────────────────────────────────────────────────
-- Audit trail for every approve/reject/reversal decision on a response.
create table moderation_log (
  id uuid primary key default uuid_generate_v4(),
  response_id uuid not null references responses(id) on delete cascade,
  moderator_id uuid not null references profiles(id),
  decision moderation_status not null,
  created_at timestamptz not null default now()
);

alter table moderation_log enable row level security;

create policy "Admins can view moderation log" on moderation_log
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ─── CHALLENGE SCHEDULING + TAGS ─────────────────────────────────────────────
alter table challenges
  add column scheduled_date date unique,
  add column tags text[] not null default '{}';

-- Challenges have only ever been written by the service-role cron/admin
-- client until now — add explicit admin-only policies now that a signed-in
-- admin writes here directly through the UI.
create policy "Admins can insert challenges" on challenges
  for insert to authenticated with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can update challenges" on challenges
  for update to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can view all challenges" on challenges
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ─── DISPLAY NAME COOLDOWN: TRANSACTION-SCOPED ADMIN BYPASS ─────────────────
create or replace function public.enforce_display_name_cooldown()
returns trigger as $$
begin
  if coalesce(current_setting('app.bypass_display_name_cooldown', true), 'false') = 'true' then
    new.display_name_changed_at := now();
    return new;
  end if;

  if new.display_name is distinct from old.display_name then
    if old.display_name_changed_at is not null
       and now() - old.display_name_changed_at < interval '48 hours' then
      raise exception 'display_name can only be changed once every 48 hours';
    end if;
    new.display_name_changed_at := now();
  else
    new.display_name_changed_at := old.display_name_changed_at;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Caller authorization (role = 'admin') is checked in the application layer
-- before this runs, same pattern as the mod-approval actions. set_config's
-- third argument (true = is_local) scopes the bypass flag to the current
-- transaction only — it can't leak into a concurrent session's update.
create or replace function public.admin_set_identity(
  target_id uuid,
  new_username text,
  new_display_name text
)
returns void as $$
begin
  perform set_config('app.bypass_display_name_cooldown', 'true', true);
  update profiles
  set
    username = coalesce(new_username, username),
    display_name = coalesce(new_display_name, display_name)
  where id = target_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ─── PHOTO MODERATION GRACE PERIOD: NOW CONFIGURABLE ────────────────────────
drop policy "Responses visible after you've answered that challenge" on responses;

create policy "Responses visible after you've answered that challenge" on responses
  for select to authenticated using (
    has_answered(challenge_id)
    and (
      user_id = auth.uid()
      or moderation_status = 'approved'
      or (
        moderation_status = 'pending'
        and answered_at > now() - ((select photo_grace_minutes from app_config) * interval '1 minute')
      )
    )
  );
