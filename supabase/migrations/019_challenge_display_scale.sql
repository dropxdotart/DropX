-- Per-challenge display tuning for the new composer's live preview: how big
-- the prompt text and any prompt/choice images render on a user's phone.
-- Kept to a narrow range on purpose — this is basic per-drop fit-and-finish
-- (a long prompt running small, an image that wants more room), not a
-- layout escape hatch.
alter table challenges add column text_scale numeric not null default 1.0 check (text_scale between 0.75 and 1.5);
alter table challenges add column image_scale numeric not null default 1.0 check (image_scale between 0.6 and 1.4);
