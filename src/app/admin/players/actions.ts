'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminSession } from '../auth'

// Players and gifts (see migration 008). A gift or balance edit waits in
// player_grants until the player's game next syncs (every ~30s while
// playing, and when the app opens).

export type PlayerRow = {
  id: string
  short_id: string
  scrap: number
  xp: number
  level: number
  plots: number
  workers: number
  last_seen: string
  created_at: string
}

export type GrantRow = {
  id: number
  kind: 'bricks' | 'set_bricks' | 'boost' | 'upgrade'
  amount: number
  upgrade: string | null
  message: string | null
  source: string
  created_at: string
  applied_at: string | null
}

type Result = { ok: true } | { ok: false; message: string }

const FIELDS = 'id, short_id, scrap, xp, level, plots, workers, last_seen, created_at'
const UPGRADES = ['workers', 'fleet', 'tools', 'speed', 'yardSpeed', 'yardBonus']

// Most recently active first; or players whose ID starts with `search`.
export async function listPlayers(search: string): Promise<PlayerRow[]> {
  await requireAdminSession()
  let query = createAdminClient().from('players').select(FIELDS).order('last_seen', { ascending: false }).limit(50)
  const s = search.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s) query = query.ilike('short_id', `${s}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as PlayerRow[]
}

export async function listGrants(playerId: string): Promise<GrantRow[]> {
  await requireAdminSession()
  const { data, error } = await createAdminClient()
    .from('player_grants')
    .select('id, kind, amount, upgrade, message, source, created_at, applied_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as GrantRow[]
}

export async function sendGrant(
  playerId: string,
  grant: { kind: GrantRow['kind']; amount: number; upgrade: string | null; message: string }
): Promise<Result> {
  await requireAdminSession()
  if (!['bricks', 'set_bricks', 'boost', 'upgrade'].includes(grant.kind)) return { ok: false, message: 'Pick what to send' }
  if (!Number.isFinite(grant.amount) || grant.amount < 0 || (grant.kind !== 'set_bricks' && grant.amount === 0))
    return { ok: false, message: 'Enter an amount' }
  if (grant.kind === 'upgrade' && !UPGRADES.includes(grant.upgrade ?? '')) return { ok: false, message: 'Pick which upgrade' }
  if (grant.kind === 'upgrade' && !Number.isInteger(grant.amount)) return { ok: false, message: 'Upgrades are whole numbers' }
  const { error } = await createAdminClient()
    .from('player_grants')
    .insert({
      player_id: playerId,
      kind: grant.kind,
      amount: grant.amount,
      upgrade: grant.kind === 'upgrade' ? grant.upgrade : null,
      message: grant.message.trim().slice(0, 140) || null,
      source: 'admin',
    })
  return error ? { ok: false, message: error.message } : { ok: true }
}

// Take back a gift that hasn't been delivered yet.
export async function cancelGrant(id: number): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('player_grants').delete().eq('id', id).is('applied_at', null)
  return error ? { ok: false, message: error.message } : { ok: true }
}
