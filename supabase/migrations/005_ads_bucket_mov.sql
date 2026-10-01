-- iPhones record video as .mov (video/quicktime); the ads bucket rejected
-- it. Allow it alongside the existing types.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
where id = 'ads';
