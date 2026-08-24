-- `username` stays the permanent, unique @tag. `display_name` is the editable
-- name shown around the app, changeable at most once every 48 hours — that
-- cooldown is enforced by trigger (not just in application code) so it holds
-- even against a direct table update, and the client can never spoof
-- `display_name_changed_at` since the trigger always sets it itself.
alter table profiles
  add column display_name text,
  add column display_name_changed_at timestamptz,
  add column share_to_everyone boolean not null default true;

create function public.enforce_display_name_cooldown()
returns trigger as $$
begin
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

create trigger enforce_display_name_cooldown
  before update on profiles
  for each row execute procedure enforce_display_name_cooldown();
