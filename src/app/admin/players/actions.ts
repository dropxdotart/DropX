'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminSession } from '../auth'
import { audit, playerTag } from '../audit'
import { rewardText } from '@/lib/rewards'
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
  sites_cleared: number
  play_seconds: number
  ban_until: string | null
  ban_permanent: boolean
  ban_reason: string | null
  last_seen: string
  created_at: string
}

export type GrantRow = {
  id: number
  kind: 'bricks' | 'set_bricks' | 'set_level' | 'boost' | 'upgrade' | 'reset' | 'restore'
  amount: number
  upgrade: string | null
  message: string | null
  source: string
  created_at: string
  applied_at: string | null
}

type Result = { ok: true } | { ok: false; message: string }

const FIELDS =
  'id, short_id, username, scrap, xp, level, plots, workers, sites_cleared, play_seconds, last_seen, created_at, ban_until, ban_permanent, ban_reason'
const UPGRADES = ['workers', 'fleet', 'yardSize', 'yardDocks', 'tools', 'speed', 'yardSpeed', 'yardBonus']

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
  if (!['bricks', 'set_bricks', 'set_level', 'boost', 'upgrade'].includes(grant.kind)) return { ok: false, message: 'Pick what to send' }
  // Negative amounts take away (bricks, boost minutes, upgrades); a balance can't be set below 0.
  if (!Number.isFinite(grant.amount) || (grant.kind === 'set_bricks' ? grant.amount < 0 : grant.amount === 0))
    return { ok: false, message: 'Enter an amount' }
  if (grant.kind === 'set_level' && !(Number.isInteger(grant.amount) && grant.amount >= 1 && grant.amount <= 10000))
    return { ok: false, message: 'Levels are whole numbers from 1' }
  if (grant.kind === 'upgrade' && !UPGRADES.includes(grant.upgrade ?? '')) return { ok: false, message: 'Pick which upgrade' }
  if (grant.kind === 'upgrade' && !Number.isInteger(grant.amount)) return { ok: false, message: 'Upgrades are whole numbers' }
  await backup(playerId, `Before: ${rewardText(grant.kind, grant.amount, grant.upgrade)}`)
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
  if (error) return { ok: false, message: error.message }
  await audit(rewardText(grant.kind, grant.amount, grant.upgrade), await playerTag(playerId), grant.message.trim() ? { message: grant.message.trim() } : null)
  return { ok: true }
}

// Take back a gift that hasn't been delivered yet.
export async function cancelGrant(id: number): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('player_grants').delete().eq('id', id).is('applied_at', null)
  if (error) return { ok: false, message: error.message }
  await audit('Cancelled a gift', null, { grant: id })
  return { ok: true }
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
  await audit(name === null ? 'Cleared username' : 'Renamed player', await playerTag(playerId), name === null ? null : { name: name.trim() })
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
  await audit('Banned a word', w)
  return { ok: true }
}

export async function removeBannedWord(word: string): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('banned_words').delete().eq('word', word)
  if (error) return { ok: false, message: error.message }
  await audit('Unbanned a word', word)
  return { ok: true }
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
  await backup(playerId, 'Before: progress reset')
  const admin = createAdminClient()
  const { error } = await admin
    .from('player_grants')
    .insert({ player_id: playerId, kind: 'reset', amount: 0, message: message.trim().slice(0, 140) || null, source: 'admin' })
  if (error) return { ok: false, message: error.message }
  await admin.from('players').update({ save: null, scrap: 0, xp: 0, level: 1, plots: 1, workers: 1 }).eq('id', playerId)
  await audit('Reset progress', await playerTag(playerId), message.trim() ? { message: message.trim() } : null)
  return { ok: true }
}

// ── Backups ──────────────────────────────────────────────────────────────

const KEEP_BACKUPS = 30

// Snapshots the player's last synced save before an admin changes it.
async function backup(playerId: string, reason: string) {
  const admin = createAdminClient()
  const { data: p } = await admin.from('players').select('save, scrap, xp, level').eq('id', playerId).maybeSingle()
  if (!p?.save) return // nothing synced yet
  await admin.from('player_backups').insert({ player_id: playerId, save: p.save, scrap: p.scrap, xp: p.xp, level: p.level, reason })
  // Keep the newest few per player.
  const { data: old } = await admin
    .from('player_backups')
    .select('id')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .range(KEEP_BACKUPS, KEEP_BACKUPS + 50)
  if (old?.length) await admin.from('player_backups').delete().in('id', old.map((b) => b.id))
}

export type BackupRow = { id: number; scrap: number; level: number; reason: string; created_at: string }

export async function listBackups(playerId: string): Promise<BackupRow[]> {
  await requireAdminSession()
  const { data, error } = await createAdminClient()
    .from('player_backups')
    .select('id, scrap, level, reason, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as BackupRow[]
}

// Puts a backup back: the player's game swaps in that save on its next
// sync. The current save is backed up first, so a restore can be undone.
export async function restoreBackup(backupId: number): Promise<Result> {
  await requireAdminSession()
  const admin = createAdminClient()
  const { data: b } = await admin.from('player_backups').select('player_id, save, scrap, xp, level, created_at').eq('id', backupId).maybeSingle()
  if (!b?.save) return { ok: false, message: 'That backup is gone' }
  await backup(b.player_id, 'Before: restoring a backup')
  const { error } = await admin.from('player_grants').insert({
    player_id: b.player_id,
    kind: 'restore',
    amount: 0,
    data: b.save,
    message: null,
    source: 'admin',
  })
  if (error) return { ok: false, message: error.message }
  await admin.from('players').update({ save: b.save, scrap: b.scrap, xp: b.xp, level: b.level }).eq('id', b.player_id)
  await audit('Restored a backup', await playerTag(b.player_id), { from: b.created_at })
  return { ok: true }
}

// ── Bans ─────────────────────────────────────────────────────────────────

// Bans until `until` (ISO), or for good with null. The player's game shows
// a block screen with the reason from its next sync.
export async function banPlayer(playerId: string, reason: string, until: string | null): Promise<Result> {
  await requireAdminSession()
  const why = reason.trim().slice(0, 200)
  if (!why) return { ok: false, message: 'Give a reason — the player sees it' }
  if (until !== null && !(new Date(until).getTime() > Date.now())) return { ok: false, message: 'The ban has to end in the future' }
  const { error } = await createAdminClient()
    .from('players')
    .update({ ban_until: until, ban_permanent: until === null, ban_reason: why })
    .eq('id', playerId)
  if (error) return { ok: false, message: error.message }
  await audit(until === null ? 'Banned permanently' : 'Banned', await playerTag(playerId), { reason: why, until })
  return { ok: true }
}

export async function unbanPlayer(playerId: string): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('players').update({ ban_until: null, ban_permanent: false, ban_reason: null }).eq('id', playerId)
  if (error) return { ok: false, message: error.message }
  await audit('Unbanned', await playerTag(playerId))
  return { ok: true }
}

// ── Watching ─────────────────────────────────────────────────────────────

export type WatchData = { short_id: string; username: string | null; save: unknown; last_seen: string; scrap: number; level: number } | null

// A player's last synced save, for the read-only watch view.
export async function getPlayerSave(playerId: string): Promise<WatchData> {
  await requireAdminSession()
  const { data } = await createAdminClient()
    .from('players')
    .select('short_id, username, save, last_seen, scrap, level')
    .eq('id', playerId)
    .maybeSingle()
  return (data as WatchData) ?? null
}
