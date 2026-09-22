-- Self-hosted ad module — a stopgap until the app is approved for Google
-- Ads. No third-party network involved: the team uploads its own creative
-- (image or video, each with an optional click-through link), shown to
-- players between rounds. Everyone can read active ads (they're public
-- content by nature); writes only ever happen through the service-role
-- client from a password-gated admin route (see src/app/admin/ads), since
-- there's no per-user role system anymore after the rebuild — this is
-- deliberately not RLS-gated by a "role" column that doesn't exist.
create type ad_kind as enum ('image', 'video');

create table ads (
  id uuid primary key default uuid_generate_v4(),
  kind ad_kind not null,
  media_url text not null,
  click_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table ads enable row level security;

create policy "Anyone can view active ads" on ads
  for select to authenticated using (active);
