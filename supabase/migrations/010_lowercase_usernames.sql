-- Tags/usernames are always lowercase — enforced at the DB level (not just
-- client-side) so it holds no matter which write path is used, and so two
-- users can never end up with handles that only differ by case.
update profiles set username = lower(username) where username <> lower(username);

alter table profiles
  add constraint username_is_lowercase check (username = lower(username));

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(new.raw_user_meta_data ->> 'username'));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

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
    username = coalesce(lower(new_username), username),
    display_name = coalesce(new_display_name, display_name)
  where id = target_id;
end;
$$ language plpgsql security definer set search_path = public;
