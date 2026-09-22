-- Fresh schema for the real-time party game: players join a room by code,
-- a host runs the room through a sequence of rounds, each round is one of
-- three distinct formats:
--   - hot_take: instant two-option vote, no anonymity, immediate reveal.
--   - who_said_it: everyone answers a prompt anonymously, then everyone
--     guesses which player wrote which answer (Psych!/Fibbage-style).
--   - caption: an image drops, everyone submits a caption anonymously, the
--     room votes for the funniest one (no authorship guessing — pure
--     popularity, unlike who_said_it).
-- Deliberately separate response tables per round type (not one generic
-- "answers" table) since the three shapes genuinely differ: a vote has no
-- text, a who-said-it answer needs a guess-matching table, a caption needs
-- a vote-for-funniest table instead.

create extension if not exists "uuid-ossp";

create type round_type as enum ('hot_take', 'who_said_it', 'caption');
create type room_status as enum ('lobby', 'in_round', 'finished');
create type round_status as enum ('pending', 'answering', 'guessing', 'revealed');

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- Lightweight guest identity, not a real account — see
-- NicknameGate.tsx. auth.users rows here are anonymous sessions (Supabase
-- anonymous auth), and username is just a chosen nickname, not a unique
-- handle: two party guests can both be "Mike".
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(new.raw_user_meta_data ->> 'username'));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── ROOMS ───────────────────────────────────────────────────────────────────
-- `code` is the short join code players type in — uppercase, easy to read
-- aloud/text. current_round_index points at whichever row in `rounds` (by
-- round_index) is live; -1 while still in the lobby.
create table rooms (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null check (code = upper(code)),
  host_id uuid not null references profiles(id) on delete cascade,
  status room_status not null default 'lobby',
  current_round_index int not null default -1,
  created_at timestamptz not null default now()
);

create table room_players (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  score int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- ─── ROUNDS ──────────────────────────────────────────────────────────────────
-- One row per round in a room's sequence. `prompt` carries whichever text
-- the round type needs (the hot-take statement, the who-said-it question,
-- or the caption-this instructions); option_a/option_b are hot_take-only,
-- image_url is caption-only — left null for the round types that don't use
-- them rather than splitting into per-type detail tables, since (unlike
-- the old drops model) a round only ever exists inside one specific live
-- room instance, not authored ahead of time and reused.
create table rounds (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_index int not null,
  type round_type not null,
  prompt text not null,
  option_a text,
  option_b text,
  image_url text,
  status round_status not null default 'pending',
  started_at timestamptz,
  unique (room_id, round_index)
);

-- ─── HOT TAKE ────────────────────────────────────────────────────────────────
create table hot_take_votes (
  round_id uuid not null references rounds(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  choice text not null check (choice in ('a', 'b')),
  voted_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

-- ─── WHO SAID IT ─────────────────────────────────────────────────────────────
-- The real author is hidden from other players until the round reaches
-- 'revealed' (see RLS) — that's the whole game. guesses match a guesser to
-- who they think wrote a given (author-identified) answer.
create table who_said_it_answers (
  round_id uuid not null references rounds(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  answer text not null,
  submitted_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

create table who_said_it_guesses (
  round_id uuid not null references rounds(id) on delete cascade,
  guesser_id uuid not null references profiles(id) on delete cascade,
  answer_author_id uuid not null references profiles(id) on delete cascade,
  guessed_author_id uuid not null references profiles(id) on delete cascade,
  primary key (round_id, guesser_id, answer_author_id)
);

-- ─── CAPTION ─────────────────────────────────────────────────────────────────
-- Captions are anonymous the same way who_said_it answers are (hidden
-- author until reveal), but the room votes for funniest instead of
-- guessing who wrote each one.
create table caption_submissions (
  round_id uuid not null references rounds(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  caption text not null check (char_length(caption) between 1 and 300),
  submitted_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

create table caption_votes (
  round_id uuid not null references rounds(id) on delete cascade,
  voter_id uuid not null references profiles(id) on delete cascade,
  caption_author_id uuid not null references profiles(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (round_id, voter_id)
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table rooms enable row level security;
alter table room_players enable row level security;
alter table rounds enable row level security;
alter table hot_take_votes enable row level security;
alter table who_said_it_answers enable row level security;
alter table who_said_it_guesses enable row level security;
alter table caption_submissions enable row level security;
alter table caption_votes enable row level security;

create policy "Authenticated users can view profiles" on profiles
  for select to authenticated using (true);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- Player lists/rounds are visible only to room members — no "browse all
-- rooms" concept, joining requires already knowing the code. Rooms
-- themselves are readable by any signed-in user (see below): the join flow
-- needs to look a room up by code *before* you're a member, and a room's
-- own metadata isn't sensitive — the code itself is the real access control.
create function public.is_in_room(target_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from room_players
    where room_id = target_room_id
    and user_id = auth.uid()
  );
$$;

create policy "Authenticated users can view rooms" on rooms
  for select to authenticated using (true);
create policy "Any signed-in user can create a room" on rooms
  for insert to authenticated with check (host_id = auth.uid());
create policy "Host can update their room" on rooms
  for update to authenticated using (host_id = auth.uid());

create policy "Room members can view the player list" on room_players
  for select to authenticated using (is_in_room(room_id));
create policy "Users can join a room as themselves" on room_players
  for insert to authenticated with check (user_id = auth.uid());
create policy "Host can update player scores" on room_players
  for update to authenticated using (
    exists (select 1 from rooms r where r.id = room_id and r.host_id = auth.uid())
  );

create policy "Room members can view rounds" on rounds
  for select to authenticated using (is_in_room(room_id));
create policy "Host can manage rounds" on rounds
  for all to authenticated using (
    exists (select 1 from rooms r where r.id = room_id and r.host_id = auth.uid())
  );

-- Hot take: no anonymity concern (a vote isn't hidden content), any room
-- member can see all votes and cast their own.
create policy "Room members can view hot take votes" on hot_take_votes
  for select to authenticated using (
    exists (select 1 from rounds rd where rd.id = round_id and is_in_room(rd.room_id))
  );
create policy "Users can cast their own hot take vote" on hot_take_votes
  for insert to authenticated with check (user_id = auth.uid());

-- Who-said-it: your own answer is always visible to you; everyone else's
-- only becomes visible once the round is revealed — that's the anonymity
-- the whole round depends on.
create policy "Who-said-it answers visible to author, or everyone once revealed" on who_said_it_answers
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from rounds rd where rd.id = round_id and rd.status = 'revealed' and is_in_room(rd.room_id))
  );
create policy "Users can submit their own who-said-it answer" on who_said_it_answers
  for insert to authenticated with check (user_id = auth.uid());

-- Guesses are only meaningful pre-reveal, and only the guesser needs to see
-- their own picks while guessing — post-reveal, everyone can see everyone's
-- guesses for the "who fooled who" recap.
create policy "Own guesses visible while guessing, everyone's once revealed" on who_said_it_guesses
  for select to authenticated using (
    guesser_id = auth.uid()
    or exists (select 1 from rounds rd where rd.id = round_id and rd.status = 'revealed' and is_in_room(rd.room_id))
  );
create policy "Users can submit their own guesses" on who_said_it_guesses
  for insert to authenticated with check (guesser_id = auth.uid());

-- Caption: same hidden-until-revealed authorship as who-said-it, but
-- captions get voted on instead of guessed.
create policy "Captions visible to author, or everyone once revealed" on caption_submissions
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from rounds rd where rd.id = round_id and rd.status = 'revealed' and is_in_room(rd.room_id))
  );
create policy "Users can submit their own caption" on caption_submissions
  for insert to authenticated with check (user_id = auth.uid());

create policy "Own caption vote visible while voting, everyone's once revealed" on caption_votes
  for select to authenticated using (
    voter_id = auth.uid()
    or exists (select 1 from rounds rd where rd.id = round_id and rd.status = 'revealed' and is_in_room(rd.room_id))
  );
create policy "Users can cast their own caption vote" on caption_votes
  for insert to authenticated with check (voter_id = auth.uid());

-- ─── REALTIME ────────────────────────────────────────────────────────────────
-- Live sync (lobby roster, round transitions) is driven by Postgres
-- Changes over these three tables.
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_players;
alter publication supabase_realtime add table rounds;
