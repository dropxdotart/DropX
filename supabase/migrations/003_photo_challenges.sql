-- Photo challenges: a new challenge type that needs moderation before it's
-- fully "graded." Text/multiple-choice responses grade themselves instantly
-- (unchanged); photo responses insert as pending and get approved/rejected
-- by a mod, which is what finally sets is_correct.

alter type challenge_type add value 'photo';

create type moderation_status as enum ('pending', 'approved', 'rejected');

alter table responses
  add column photo_url text,
  add column moderation_status moderation_status not null default 'approved',
  alter column is_correct drop not null;

-- One user preference so far: whether to show the public Everyone feed tab
-- at all, or just Friends.
alter table profiles
  add column show_everyone_tab boolean not null default true;
