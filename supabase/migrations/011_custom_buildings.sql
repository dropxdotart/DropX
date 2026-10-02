-- Admin-made buildings. `shape` is {size: [W,H,D], data: run-length base64
-- cells} (see src/lib/game/shapes.ts); `params` keeps the slider-builder
-- settings so the admin can reopen and tweak them. A building can be
-- started in the game only while it's on and inside its optional window.
-- Read and written through server actions with the service role.

create table custom_buildings (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  emoji text not null default '🏢',
  shape jsonb not null,
  params jsonb,
  required_level integer not null default 1 check (required_level >= 1),
  contract_cost double precision not null default 0 check (contract_cost >= 0),
  brick_value double precision not null default 1 check (brick_value > 0),
  bonus double precision not null default 0 check (bonus >= 0),
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table custom_buildings enable row level security;
revoke all on custom_buildings from anon, authenticated;
