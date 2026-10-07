-- Which island an admin-made building is built on (see islands.ts).
alter table custom_buildings
  add column if not exists island text not null default 'city' check (island in ('houses', 'city', 'industrial'));
update custom_buildings set island = 'houses' where name = 'Sukkah';
