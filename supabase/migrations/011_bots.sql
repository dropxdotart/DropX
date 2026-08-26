-- Marks accounts created and piloted through the Handler tool (src/app/handlers).
-- Purely a bookkeeping flag for admins — never surfaced in any user-facing UI.
alter table profiles add column is_bot boolean not null default false;
