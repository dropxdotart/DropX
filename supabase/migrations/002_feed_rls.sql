-- responses.user_id already FKs to auth.users; this second FK to profiles
-- (always in sync 1:1 via the signup trigger) lets PostgREST auto-embed
-- profiles when querying responses for the feed.
alter table responses
  add constraint responses_user_id_profiles_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

-- Opens up read access for the feed page: usernames/badges become visible
-- to any signed-in user, and a response becomes visible to other users only
-- once the viewer has answered that same challenge themselves — so nobody
-- can scroll the feed to see the correct answer before playing.
create policy "Authenticated users can view profiles" on profiles
  for select to authenticated using (true);

create policy "Responses visible after you've answered that challenge" on responses
  for select to authenticated using (
    exists (
      select 1 from responses viewer_response
      where viewer_response.challenge_id = responses.challenge_id
      and viewer_response.user_id = auth.uid()
    )
  );
