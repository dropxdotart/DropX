'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { usernameProblem } from '@/lib/usernames'

// The game's link to its player record (see migration 008). Players never
// sign in: the device's random player id is the key, and only the game on
// that device knows it. Everything runs with the service role here.

export type RewardKind = 'bricks' | 'set_bricks' | 'set_level' | 'boost' | 'upgrade' | 'reset'
export type Grant = { kind: RewardKind; amount: number; upgrade: string | null; message: string | null; source: string }

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
): Promise<{ shortId: string | null; username: string | null; grants: Grant[] }> {
  if (!UUID.test(id)) return { shortId: null, username: null, grants: [] }
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
    .select('kind, amount, upgrade, message, source, created_at')
  const grants = (data ?? [])
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(({ kind, amount, upgrade, message, source }) => ({ kind, amount, upgrade, message, source }))
  // The current name (an admin may have changed or cleared it).
  const { data: me } = await admin.from('players').select('username').eq('id', id).maybeSingle()
  return { shortId, username: me?.username ?? null, grants }
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
    .select('id, name, emoji, shape, required_level, contract_cost, brick_value, bonus, active, starts_at, ends_at')
  const now = Date.now()
  return (data ?? []).map((b) => ({
    id: `custom-${b.id}`,
    name: b.name,
    emoji: b.emoji,
    blueprint: 0,
    shape: b.shape,
    requiredLevel: b.required_level,
    contractCost: b.contract_cost,
    brickValue: b.brick_value,
    bonus: b.bonus,
    available:
      b.active && (!b.starts_at || new Date(b.starts_at).getTime() <= now) && (!b.ends_at || new Date(b.ends_at).getTime() > now),
  }))
}
