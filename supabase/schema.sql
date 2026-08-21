-- Extensions
create extension if not exists "uuid-ossp";

-- ─── TYPES ───────────────────────────────────────────────────────────────────
create type challenge_type as enum ('multiple_choice', 'text');

-- ─── CHALLENGES ──────────────────────────────────────────────────────────────
-- A pool of authored challenges. `drop_at` is null while a challenge sits in
-- the pool, and is filled in by the daily drop job (see /api/cron/drop) once
-- it's picked and given a random moment inside the day's window — that keeps
-- the exact drop time unknown until it actually happens (see RLS below).
create table challenges (
  id uuid primary key default uuid_generate_v4(),
  drop_at timestamptz unique,
  type challenge_type not null default 'multiple_choice',
  prompt text not null,
  choices jsonb,
  correct_answer text not null,
  explanation text,
  created_at timestamptz not null default now()
);

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- One row per user; tracks streaks.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_answered_date date,
  created_at timestamptz not null default now()
);

-- ─── RESPONSES ───────────────────────────────────────────────────────────────
-- One row per (user, challenge) answer. Unique constraint enforces one attempt.
create table responses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  answer text not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

-- Auto-create a profile row when a user signs up.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
alter table challenges enable row level security;
alter table profiles enable row level security;
alter table responses enable row level security;

-- Also hides pool challenges (drop_at is null) from clients entirely, since
-- null <= now() is never true — only the admin (service role) client used by
-- the cron job can see/pick from the pool.
create policy "Dropped challenges are readable" on challenges
  for select using (drop_at <= now());

create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

create policy "Users can view own responses" on responses
  for select using (auth.uid() = user_id);

create policy "Users can insert own responses" on responses
  for insert with check (auth.uid() = user_id);
