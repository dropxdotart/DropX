-- Adds a role tier (user/mod/admin), a free-form badges list, and a strike
-- counter (for the takedown/strike moderation power) to profiles.
create type user_role as enum ('user', 'mod', 'admin');

alter table profiles
  add column role user_role not null default 'user',
  add column badges text[] not null default '{}',
  add column strike_count int not null default 0;
