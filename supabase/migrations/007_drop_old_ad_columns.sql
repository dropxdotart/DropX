-- Follow-up to 006: media fields live on ad_media now and the new admin is
-- deployed, so the copies left on `ads` (assignments) can go.
alter table ads drop column kind, drop column media_url, drop column click_url;
