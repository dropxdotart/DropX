-- Photos are uploaded to challenge-photos/{user_id}/{filename} — this policy
-- restricts uploads to a user's own folder. The bucket itself is public-read
-- (set at bucket creation), so no separate SELECT policy is needed here.
create policy "Users can upload their own challenge photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'challenge-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
