-- Game-wide things admins schedule: events (double bricks, crew boost,
-- upgrade sale, double XP), messages to everyone, and gifts to everyone.
-- The game picks them up when it syncs.

create table live_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('double_bricks', 'crew_boost', 'upgrade_sale', 'double_xp')),
  value double precision not null check (value > 0), -- multiplier, or % off for a sale
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  style text not null check (style in ('popup', 'banner')),
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table global_gifts (
  id uuid primary key default gen_random_uuid(),
  kind reward_kind not null check (kind in ('bricks', 'boost', 'upgrade')),
  amount double precision not null check (amount > 0),
  upgrade text,
  message text,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table global_gift_claims (
  gift_id uuid not null references global_gifts (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (gift_id, player_id)
);

alter table live_events enable row level security;
alter table broadcasts enable row level security;
alter table global_gifts enable row level security;
alter table global_gift_claims enable row level security;
revoke all on live_events, broadcasts, global_gifts, global_gift_claims from anon, authenticated;
