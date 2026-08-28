-- Challenge system redesign: draft/confirmed authoring lifecycle, ungraded
-- (mod-rated) challenges for captions, image-rendered choices, and an
-- image prompt for challenges like "caption this photo". No RLS changes —
-- the existing responses policies already gate on moderation_status/role
-- generically, not on challenge type, so text-review and caption-review
-- reuse them as-is (see mod/actions.ts's existing race-safe update pattern,
-- which the new queues follow too).

-- Two-stage authoring: a challenge is a draft until explicitly confirmed;
-- only confirmed challenges are schedulable/pushable (enforced in
-- application code, alongside the existing "already used" lock). Every
-- pre-existing challenge was authored and used under the old one-stage
-- model, so it backfills straight to confirmed rather than becoming an
-- unschedulable draft.
alter table challenges add column status text not null default 'draft' check (status in ('draft', 'confirmed'));
update challenges set status = 'confirmed';

-- Ungraded challenges (captions, and future no-single-right-answer formats)
-- have no correct_answer to check against — mods judge each response on a
-- 1-10 scale instead (responses.rating below). correct_answer stays
-- required at the table level; ungraded challenges just leave it as an
-- unused placeholder and application code branches on `graded`.
alter table challenges add column graded boolean not null default true;

-- For challenges whose *prompt* is itself an image (e.g. "caption this
-- photo") — distinct from responses.photo_url, which is the answer to a
-- photo challenge, not the prompt.
alter table challenges add column prompt_image_url text;

-- Multiple-choice challenges whose `choices` are image URLs instead of
-- text. Same storage (choices jsonb) and grading (pick one, compare to
-- correct_answer) as today's multiple_choice — only how AnswerForm and the
-- admin composer render each choice differs.
alter table challenges add column choices_are_images boolean not null default false;

-- Mods' 1-10 quality/funniness rating on ungraded (ungraded=true) caption
-- responses, given via the same swipe-review card used for photo and text
-- review. Only ever set once the response is approved.
alter table responses add column rating int check (rating between 1 and 10);
