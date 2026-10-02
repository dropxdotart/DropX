'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// The game's link to its player record (see migration 008). Players never
// sign in: the device's random player id is the key, and only the game on
// that device knows it. Everything runs with the service role here.

export type RewardKind = 'bricks' | 'set_bricks' | 'boost' | 'upgrade'
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
}

// Uploads the save and summary, and hands back any gifts or balance edits
// waiting for this player. Gifts are marked delivered in the same step, so
// one can never be applied twice.
export async function syncPlayer(
  id: string,
  summary: PlayerSummary,
  save: unknown
): Promise<{ shortId: string | null; grants: Grant[] }> {
  if (!UUID.test(id)) return { shortId: null, grants: [] }
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
      last_seen: new Date().toISOString(),
    })
    .eq('id', id)
  const { data } = await admin
    .from('player_grants')
    .update({ applied_at: new Date().toISOString() })
    .eq('player_id', id)
    .is('applied_at', null)
    .select('kind, amount, upgrade, message, source, created_at')
  const grants = (data ?? [])
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(({ kind, amount, upgrade, message, source }) => ({ kind, amount, upgrade, message, source }))
  return { shortId, grants }
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
