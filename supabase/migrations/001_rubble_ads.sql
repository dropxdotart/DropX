-- Rubble — an idle demolition game. No player accounts: progress is saved
-- client-side (localStorage), so the only backend surface is the
-- admin-controlled ad system. Writes to `ads` only ever go through the
-- service-role client (see src/lib/supabase/admin.ts) from the shared
-- /admin/* password gate — there's no signed-in "player" role at all here,
-- so the only RLS concern is letting the game itself (anonymous, no
-- session) read which ads are currently active.

create extension if not exists "uuid-ossp";

create type ad_kind as enum ('image', 'video');
create type ad_placement as enum ('rewarded', 'interstitial', 'banner');

create table ads (
  id uuid primary key default uuid_generate_v4(),
  kind ad_kind not null,
  placement ad_placement not null default 'interstitial',
  media_url text not null,
  click_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table ads enable row level security;

-- `anon` (not `authenticated`) — the game never signs anyone in.
create policy "Anyone can view active ads" on ads
  for select to anon using (active);

-- A fresh `create schema public` (this project was rebuilt from a full
-- wipe) doesn't carry over the table-level GRANTs Supabase's own project
-- creation normally sets up — RLS alone isn't enough, Postgres also
-- requires the base privilege or every query 401s with "permission denied"
-- regardless of policy. Re-establishing the standard Supabase baseline here.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
