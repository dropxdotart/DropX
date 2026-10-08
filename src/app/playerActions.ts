'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { usernameProblem } from '@/lib/usernames'
import type { LiveEventKind } from '@/lib/liveEvents'

// The game's link to its player record (see migration 008). Players never
// sign in: the device's random player id is the key, and only the game on
// that device knows it. Everything runs with the service role here.

export type RewardKind = 'bricks' | 'set_bricks' | 'set_level' | 'boost' | 'upgrade' | 'reset' | 'restore' | 'rain'
export type Grant = { kind: RewardKind; amount: number; upgrade: string | null; message: string | null; source: string; data?: unknown }
export type LiveInfo = {
  events: { id: string; kind: LiveEventKind; value: number; startsAt: string; endsAt: string }[]
  broadcasts: { id: string; title: string; body: string | null; style: 'popup' | 'banner'; endsAt: string }[]
}
// A ban the game must show (until = ISO end, or null when permanent).
export type Ban = { until: string | null; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// No 0/O or 1/I/L, so IDs read out loud without mix-ups.
const SHORT_ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function makeShortId() {
  let s = ''
  for (let i = 0; i < 6; i++) s += SHORT_ID_CHARS[Math.floor(Math.random() * SHORT_ID_CHARS.length)]
  return s
}

// Creates the player record on first contact (with a fresh short id).
async function ensurePlayer(id: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('players').select('short_id').eq('id', id).maybeSingle()
  if (data) return data.short_id
  for (let attempt = 0; attempt < 5; attempt++) {
    const shortId = makeShortId()
    const { error } = await admin.from('players').insert({ id, short_id: shortId })
    if (!error) return shortId
    // Someone else's id clashed, or this player was created concurrently.
    const again = await admin.from('players').select('short_id').eq('id', id).maybeSingle()
    if (again.data) return again.data.short_id
  }
  return null
}

export type PlayerSummary = {
  scrap: number
  xp: number
  level: number
  plots: number
  workers: number
  sitesCleared: number
}

// This visit so far (seconds counts only time with the game on screen).
export type SessionInfo = { id: string; startedAt: number; seconds: number }
export type ActivityIn = { kind: string; building: string; name: string; seconds?: number; at: number }

// Uploads the save and summary, and hands back any gifts or balance edits
// waiting for this player. Gifts are marked delivered in the same step, so
// one can never be applied twice.
export async function syncPlayer(
  id: string,
  summary: PlayerSummary,
  save: unknown,
  session?: SessionInfo,
  activity: ActivityIn[] = []
): Promise<{ shortId: string | null; username: string | null; grants: Grant[]; ban: Ban | null; live: LiveInfo }> {
  const noLive: LiveInfo = { events: [], broadcasts: [] }
  if (!UUID.test(id)) return { shortId: null, username: null, grants: [], ban: null, live: noLive }
  const shortId = await ensurePlayer(id)
  const admin = createAdminClient()
  const num = (n: number) => (Number.isFinite(n) ? n : 0)
  await admin
    .from('players')
    .update({
      save,
      scrap: num(summary.scrap),
      xp: num(summary.xp),
      level: Math.round(num(summary.level)),
      plots: Math.round(num(summary.plots)),
      workers: Math.round(num(summary.workers)),
      sites_cleared: Math.round(num(summary.sitesCleared)),
      last_seen: new Date().toISOString(),
    })
    .eq('id', id)
  if (session && UUID.test(session.id)) {
    await admin.rpc('record_session', {
      p_player: id,
      p_session: session.id,
      p_started: new Date(num(session.startedAt) || Date.now()).toISOString(),
      p_seconds: num(session.seconds),
    })
  }
  const events = (Array.isArray(activity) ? activity : [])
    .slice(0, 200)
    .filter((e) => (e.kind === 'building_started' || e.kind === 'building_finished') && typeof e.building === 'string')
    .map((e) => ({
      player_id: id,
      kind: e.kind,
      building: e.building.slice(0, 80),
      building_name: String(e.name ?? '').slice(0, 80),
      seconds: e.kind === 'building_finished' && Number.isFinite(e.seconds) ? Math.max(0, Number(e.seconds)) : null,
      created_at: new Date(Math.min(num(e.at) || Date.now(), Date.now())).toISOString(),
    }))
  if (events.length) await admin.from('player_events').insert(events)
  // Prune old activity now and then (cheap, indexed).
  if (Math.random() < 0.01) await admin.rpc('prune_activity')
  const { data } = await admin
    .from('player_grants')
    .update({ applied_at: new Date().toISOString() })
    .eq('player_id', id)
    .is('applied_at', null)
    .select('kind, amount, upgrade, message, source, data, created_at')
  const grants = (data ?? [])
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(({ kind, amount, upgrade, message, source, data }) => ({ kind, amount, upgrade, message, source, ...(data ? { data } : {}) }))
  // Gifts to everyone: each live one is claimed once per player (the
  // claim's primary key makes a second claim a no-op).
  const nowIso = new Date().toISOString()
  const [{ data: liveGifts }, { data: liveEvents }, { data: broadcasts }] = await Promise.all([
    admin.from('global_gifts').select('id, kind, amount, upgrade, message').eq('active', true).lte('starts_at', nowIso).gt('ends_at', nowIso),
    admin.from('live_events').select('id, kind, value, starts_at, ends_at').eq('active', true).lte('starts_at', nowIso).gt('ends_at', nowIso),
    admin.from('broadcasts').select('id, title, body, style, ends_at').eq('active', true).lte('starts_at', nowIso).gt('ends_at', nowIso),
  ])
  if (liveGifts?.length) {
    const { data: claimed } = await admin
      .from('global_gift_claims')
      .upsert(
        liveGifts.map((g) => ({ gift_id: g.id, player_id: id })),
        { onConflict: 'gift_id,player_id', ignoreDuplicates: true }
      )
      .select('gift_id')
    for (const c of claimed ?? []) {
      const g = liveGifts.find((x) => x.id === c.gift_id)
      if (!g) continue
      const grant: Grant = { kind: g.kind, amount: g.amount, upgrade: g.upgrade, message: g.message, source: 'gift_all' }
      grants.push(grant)
      await admin.from('player_grants').insert({ player_id: id, ...grant, applied_at: nowIso })
    }
  }
  const live: LiveInfo = {
    events: (liveEvents ?? []).map((e) => ({ id: e.id, kind: e.kind as LiveEventKind, value: e.value, startsAt: e.starts_at, endsAt: e.ends_at })),
    broadcasts: (broadcasts ?? []).map((b) => ({ id: b.id, title: b.title, body: b.body, style: b.style as 'popup' | 'banner', endsAt: b.ends_at })),
  }
  // The current name (an admin may have changed or cleared it).
  const { data: me } = await admin.from('players').select('username, ban_until, ban_permanent, ban_reason').eq('id', id).maybeSingle()
  const banned = me && (me.ban_permanent || (me.ban_until && new Date(me.ban_until).getTime() > Date.now()))
  const ban = banned ? { until: me.ban_permanent ? null : me.ban_until, reason: me.ban_reason ?? '' } : null
  return { shortId, username: me?.username ?? null, grants, ban, live }
}

// Sets this player's username: 3–16 letters/numbers/_, no banned words,
// and nobody else's (ignoring case).
export async function setUsername(id: string, name: string): Promise<{ ok: true; username: string } | { ok: false; message: string }> {
  if (!UUID.test(id)) return { ok: false, message: 'Something went wrong — reopen the game and try again' }
  const clean = name.trim()
  const admin = createAdminClient()
  const { data: banned } = await admin.from('banned_words').select('word')
  const problem = usernameProblem(clean, (banned ?? []).map((b) => b.word))
  if (problem) return { ok: false, message: problem }
  await ensurePlayer(id)
  const { error } = await admin.from('players').update({ username: clean }).eq('id', id)
  if (error) return { ok: false, message: error.code === '23505' ? 'That name is taken' : 'Something went wrong — try again' }
  return { ok: true, username: clean }
}

// Checks and uses a redeem code. On success returns the reward for the game
// to apply right away (and logs it in the player's gift history).
export async function redeemCode(id: string, code: string): Promise<{ ok: true; grant: Grant } | { ok: false; message: string }> {
  if (!UUID.test(id)) return { ok: false, message: 'Something went wrong — reopen the game and try again' }
  const clean = code.trim().toUpperCase()
  if (!clean) return { ok: false, message: 'Type a code first' }
  if (clean.length > 40) return { ok: false, message: "That code doesn't exist" }
  await ensurePlayer(id)
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('redeem_code', { p_player: id, p_code: clean })
  const row = data?.[0]
  if (error || !row) return { ok: false, message: 'Something went wrong — try again' }
  if (row.error) return { ok: false, message: row.error }
  const grant: Grant = { kind: row.kind, amount: row.amount, upgrade: row.upgrade, message: `Code ${clean}`, source: 'code' }
  await admin.from('player_grants').insert({ player_id: id, ...grant, applied_at: new Date().toISOString() })
  return { ok: true, grant }
}

// Admin-made buildings for the game: every one (so saves demolishing an
// older one still load), each flagged with whether it can be started now.
export async function getCustomBuildings(): Promise<import('@/lib/game/buildings').BuildingDef[]> {
  const { data } = await createAdminClient()
    .from('custom_buildings')
    .select('id, name, emoji, island, shape, required_level, contract_cost, brick_value, bonus, active, starts_at, ends_at')
  const now = Date.now()
  return (data ?? []).map((b) => ({
    id: `custom-${b.id}`,
    name: b.name,
    emoji: b.emoji,
    blueprint: 0,
    shape: b.shape,
    requiredLevel: b.required_level,
    island: b.island,
    contractCost: b.contract_cost,
    brickValue: b.brick_value,
    bonus: b.bonus,
    ...(b.ends_at ? { endsAt: b.ends_at } : {}),
    available:
      b.active && (!b.starts_at || new Date(b.starts_at).getTime() <= now) && (!b.ends_at || new Date(b.ends_at).getTime() > now),
  }))
}
