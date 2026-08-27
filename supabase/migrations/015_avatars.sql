alter table profiles add column avatar_url text;

-- Same shape as the challenge-photos bucket: public-read, uploads scoped to
-- the uploader's own folder (avatars/{user_id}/...). Files upload with
-- upsert at a fixed path (avatar.<ext>) so re-uploading replaces the old
-- image instead of piling up new objects, which needs an UPDATE policy in
-- addition to INSERT (upsert does an update when the object already exists).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5000000, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

create policy "Users can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can replace their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
