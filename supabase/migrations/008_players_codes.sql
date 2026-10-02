-- Players, cloud saves, gifts and redeem codes.
--
-- Players never sign in: each device has a random player id (kept secret
-- on the device) and syncs its save here so admins can see players, set
-- balances and send gifts. `short_id` is the public, human-friendly id a
-- player reads out for support. Gifts (and balance edits) wait in
-- `player_grants` until the player's game next syncs and applies them.
-- Everything here is service-role only: the game talks to it through
-- server actions.

create table players (
  id uuid primary key,
  short_id text not null unique,
  save jsonb,
  scrap double precision not null default 0,
  xp double precision not null default 0,
  level integer not null default 1,
  plots integer not null default 1,
  workers integer not null default 1,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index players_last_seen on players (last_seen desc);

-- What a code or a gift gives. bricks: add `amount` bricks. set_bricks:
-- set the balance to `amount` (admin edits). boost: `amount` minutes of
-- crew boost. upgrade: `amount` free levels of `upgrade`.
create type reward_kind as enum ('bricks', 'set_bricks', 'boost', 'upgrade');

create table player_grants (
  id bigint generated always as identity primary key,
  player_id uuid not null references players (id) on delete cascade,
  kind reward_kind not null,
  amount double precision not null,
  upgrade text,
  message text,
  source text not null default 'admin', -- 'admin' or 'code'
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index player_grants_pending on player_grants (player_id) where applied_at is null;

create table redeem_codes (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique, -- stored uppercase
  kind reward_kind not null check (kind <> 'set_bricks'),
  amount double precision not null check (amount > 0),
  upgrade text,
  max_uses integer check (max_uses is null or max_uses > 0),
  once_per_player boolean not null default true,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table code_redemptions (
  id bigint generated always as identity primary key,
  code_id uuid not null references redeem_codes (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index code_redemptions_code on code_redemptions (code_id);
create index code_redemptions_player on code_redemptions (code_id, player_id);

alter table players enable row level security;
alter table player_grants enable row level security;
alter table redeem_codes enable row level security;
alter table code_redemptions enable row level security;
revoke all on players, player_grants, redeem_codes, code_redemptions from anon, authenticated;

-- Redeeming is one atomic step so "max uses" and "once per player" hold
-- even when many players redeem at once. Returns the reward, or an error
-- message in `error`.
create or replace function redeem_code(p_player uuid, p_code text)
returns table (kind reward_kind, amount double precision, upgrade text, error text)
language plpgsql
as $$
declare
  c redeem_codes%rowtype;
  used integer;
begin
  select * into c from redeem_codes where code = upper(trim(p_code)) for update;
  if not found or not c.active then
    return query select null::reward_kind, null::double precision, null::text, 'That code doesn''t exist';
    return;
  end if;
  if c.expires_at is not null and c.expires_at <= now() then
    return query select null::reward_kind, null::double precision, null::text, 'That code has expired';
    return;
  end if;
  if c.once_per_player and exists (select 1 from code_redemptions r where r.code_id = c.id and r.player_id = p_player) then
    return query select null::reward_kind, null::double precision, null::text, 'You''ve already used that code';
    return;
  end if;
  select count(*) into used from code_redemptions r where r.code_id = c.id;
  if c.max_uses is not null and used >= c.max_uses then
    return query select null::reward_kind, null::double precision, null::text, 'That code has been used up';
    return;
  end if;
  insert into code_redemptions (code_id, player_id) values (c.id, p_player);
  return query select c.kind, c.amount, c.upgrade, null::text;
end;
$$;

revoke execute on function redeem_code(uuid, text) from public, anon, authenticated;
grant execute on function redeem_code(uuid, text) to service_role;
