-- Admin-curated avatar options a user can pick instead of uploading their
-- own photo. Images live in the existing avatars bucket under presets/ —
-- uploads there go through the admin (service-role) client, so they're
-- exempt from the per-user-folder storage RLS that scopes normal avatar
-- uploads to avatars/{user_id}/.
create table avatar_presets (
  id uuid primary key default uuid_generate_v4(),
  image_url text not null,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table avatar_presets enable row level security;

create policy "Users can view active avatar presets" on avatar_presets
  for select to authenticated using (active);

create policy "Admins can view all avatar presets" on avatar_presets
  for select to authenticated using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
