'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminSession } from '../auth'
import { containsBannedWord, usernameProblem } from '@/lib/usernames'

// Players and gifts (see migration 008). A gift or balance edit waits in
// player_grants until the player's game next syncs (every ~30s while
// playing, and when the app opens).

export type PlayerRow = {
  id: string
  short_id: string
  username: string | null
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
  kind: 'bricks' | 'set_bricks' | 'boost' | 'upgrade' | 'reset'
  amount: number
  upgrade: string | null
  message: string | null
  source: string
  created_at: string
  applied_at: string | null
}

type Result = { ok: true } | { ok: false; message: string }

const FIELDS = 'id, short_id, username, scrap, xp, level, plots, workers, last_seen, created_at'
const UPGRADES = ['workers', 'fleet', 'tools', 'speed', 'yardSpeed', 'yardBonus']

// Most recently active first; or players whose ID starts with, or whose
// username contains, `search`.
export async function listPlayers(search: string): Promise<PlayerRow[]> {
  await requireAdminSession()
  let query = createAdminClient().from('players').select(FIELDS).order('last_seen', { ascending: false }).limit(50)
  const s = search.trim().replace(/[^A-Za-z0-9_]/g, '')
  if (s) query = query.or(`short_id.ilike.${s.toUpperCase()}%,username.ilike.%${s}%`)
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

// Rename a player, or clear their name with null. Same rules as players
// get (3–16 letters/numbers/_, no banned words, unique).
export async function adminSetUsername(playerId: string, name: string | null): Promise<Result> {
  await requireAdminSession()
  const admin = createAdminClient()
  if (name !== null) {
    const { data: banned } = await admin.from('banned_words').select('word')
    const problem = usernameProblem(name.trim(), (banned ?? []).map((b) => b.word))
    if (problem) return { ok: false, message: problem }
  }
  const { error } = await admin.from('players').update({ username: name === null ? null : name.trim() }).eq('id', playerId)
  if (error) return { ok: false, message: error.code === '23505' ? 'That name is taken' : error.message }
  return { ok: true }
}

// ── Banned words ─────────────────────────────────────────────────────────

export async function listBannedWords(): Promise<string[]> {
  await requireAdminSession()
  const { data, error } = await createAdminClient().from('banned_words').select('word').order('word')
  if (error) throw new Error(error.message)
  return (data ?? []).map((w) => w.word)
}

export async function addBannedWord(word: string): Promise<Result> {
  await requireAdminSession()
  const w = word.trim().toLowerCase()
  if (!/^[a-z0-9]{2,30}$/.test(w)) return { ok: false, message: 'Words are 2–30 letters or numbers' }
  const { error } = await createAdminClient().from('banned_words').insert({ word: w })
  if (error) return { ok: false, message: error.code === '23505' ? 'Already on the list' : error.message }
  return { ok: true }
}

export async function removeBannedWord(word: string): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('banned_words').delete().eq('word', word)
  return error ? { ok: false, message: error.message } : { ok: true }
}

// Existing names that break the rules (e.g. a word banned after someone
// already picked it), for an admin to rename or clear.
export async function flaggedPlayers(): Promise<PlayerRow[]> {
  await requireAdminSession()
  const admin = createAdminClient()
  const [{ data: words }, { data: players }] = await Promise.all([
    admin.from('banned_words').select('word'),
    admin.from('players').select(FIELDS).not('username', 'is', null).limit(5000),
  ])
  const extra = (words ?? []).map((w) => w.word)
  return ((players ?? []) as PlayerRow[]).filter((p) => p.username && containsBannedWord(p.username, extra))
}

// Wipes a player's progress back to a fresh start (keeping their ID and
// username). Their game does it on its next sync; the record shows the
// reset straight away.
export async function resetPlayer(playerId: string, message: string): Promise<Result> {
  await requireAdminSession()
  const admin = createAdminClient()
  const { error } = await admin
    .from('player_grants')
    .insert({ player_id: playerId, kind: 'reset', amount: 0, message: message.trim().slice(0, 140) || null, source: 'admin' })
  if (error) return { ok: false, message: error.message }
  await admin.from('players').update({ save: null, scrap: 0, xp: 0, level: 1, plots: 1, workers: 1 }).eq('id', playerId)
  return { ok: true }
}
