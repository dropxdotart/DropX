-- Switching from email/password accounts to lightweight guest identities
-- (anonymous auth + a nickname) — see src/components/home/NicknameGate.tsx.
-- Nicknames aren't globally unique like a real account handle would be:
-- two party guests can both be "Mike" in different rooms (or even the same
-- one), so the old unique-lowercase-handle constraint doesn't apply here.
alter table profiles drop constraint if exists profiles_username_key;
alter table profiles drop constraint if exists profiles_username_check;
