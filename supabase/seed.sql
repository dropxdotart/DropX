-- Sample data for local verification.

-- Already dropped an hour ago, so it's answerable right now regardless of
-- what time you're testing at.
insert into challenges (drop_at, type, prompt, choices, correct_answer, explanation)
values (
  now() - interval '1 hour',
  'multiple_choice',
  'What is the capital of France?',
  '["London", "Paris", "Berlin", "Madrid"]',
  'Paris',
  'Paris has been the capital of France since 508 AD.'
);

-- Unscheduled pool entries (drop_at left null) — this is the "list of
-- challenges/quiz" the daily cron job (/api/cron/drop) picks from.
insert into challenges (type, prompt, choices, correct_answer, explanation)
values (
  'text',
  'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?',
  null,
  'echo',
  'An echo is a reflection of sound that only "speaks" when triggered by other sound (wind, voices, etc).'
);

insert into challenges (type, prompt, choices, correct_answer, explanation)
values (
  'multiple_choice',
  'Which planet is known as the Red Planet?',
  '["Venus", "Mars", "Jupiter", "Saturn"]',
  'Mars',
  'Mars appears red due to iron oxide (rust) on its surface.'
);
