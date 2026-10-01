-- How long each kind of ad must play before it can be closed: interstitials
-- become skippable, rewarded ads unlock their reward. Edited from the admin
-- ads page (service role); the game reads it anonymously. A video shorter
-- than this unlocks when it ends (handled in the game).

create table ad_settings (
  placement ad_placement primary key,
  unlock_seconds integer not null check (unlock_seconds between 0 and 120)
);

insert into ad_settings (placement, unlock_seconds) values
  ('interstitial', 10),
  ('rewarded', 15);

alter table ad_settings enable row level security;
create policy "Anyone can read ad settings" on ad_settings for select to anon using (true);
-- Migration 001's default privileges grant writes on new tables; reads only.
revoke insert, update, delete on ad_settings from anon, authenticated;
