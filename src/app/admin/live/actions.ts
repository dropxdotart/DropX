'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { EVENT_KINDS, EVENT_LIMITS, eventTitle, type LiveEventKind } from '@/lib/liveEvents'
import { rewardText } from '@/lib/rewards'
import { requireAdminSession } from '../auth'
import { audit } from '../audit'

// Game-wide events, messages to everyone and gifts to everyone (migration
// 016). Games pick them up on their next sync (within ~30s).

type Result = { ok: true } | { ok: false; message: string }

type Window = { active: boolean; starts_at: string; ends_at: string }
export type EventRow = Window & { id: string; kind: LiveEventKind; value: number }
export type BroadcastRow = Window & { id: string; title: string; body: string | null; style: 'popup' | 'banner' }
export type GiftRow = Window & { id: string; kind: 'bricks' | 'boost' | 'upgrade'; amount: number; upgrade: string | null; message: string | null; claims: number }

const TABLES = { event: 'live_events', broadcast: 'broadcasts', gift: 'global_gifts' } as const
export type LiveTable = keyof typeof TABLES
const UPGRADES = ['workers', 'fleet', 'yardSize', 'yardDocks', 'tools', 'speed', 'yardSpeed', 'yardBonus']

function checkWindow(startsAt: string, endsAt: string): string | null {
  const s = new Date(startsAt).getTime()
  const e = new Date(endsAt).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 'Pick when it starts and ends'
  if (e <= s) return 'It has to end after it starts'
  if (e <= Date.now()) return 'It has to end in the future'
  return null
}

export async function listLive(): Promise<{ events: EventRow[]; broadcasts: BroadcastRow[]; gifts: GiftRow[] }> {
  await requireAdminSession()
  const admin = createAdminClient()
  const [ev, bc, gf] = await Promise.all([
    admin.from('live_events').select('id, kind, value, active, starts_at, ends_at').order('starts_at', { ascending: false }).limit(50),
    admin.from('broadcasts').select('id, title, body, style, active, starts_at, ends_at').order('starts_at', { ascending: false }).limit(50),
    admin.from('global_gifts').select('id, kind, amount, upgrade, message, active, starts_at, ends_at').order('starts_at', { ascending: false }).limit(50),
  ])
  const gifts = (gf.data ?? []) as Omit<GiftRow, 'claims'>[]
  const counts = await Promise.all(
    gifts.map((g) => admin.from('global_gift_claims').select('player_id', { count: 'exact', head: true }).eq('gift_id', g.id))
  )
  return {
    events: (ev.data ?? []) as EventRow[],
    broadcasts: (bc.data ?? []) as BroadcastRow[],
    gifts: gifts.map((g, i) => ({ ...g, claims: counts[i].count ?? 0 })),
  }
}

export async function createEvent(kind: LiveEventKind, value: number, startsAt: string, endsAt: string): Promise<Result> {
  await requireAdminSession()
  const info = EVENT_KINDS.find((k) => k.value === kind)
  if (!info) return { ok: false, message: 'Pick an event type' }
  const lim = EVENT_LIMITS[info.unit]
  if (!(value >= lim.min && value <= lim.max))
    return { ok: false, message: info.unit === 'percent' ? `Pick ${lim.min}–${lim.max}% off` : `Pick ${lim.min}× to ${lim.max}×` }
  const bad = checkWindow(startsAt, endsAt)
  if (bad) return { ok: false, message: bad }
  const { error } = await createAdminClient().from('live_events').insert({ kind, value, starts_at: startsAt, ends_at: endsAt })
  if (error) return { ok: false, message: error.message }
  await audit('Scheduled event', eventTitle(kind, value), { startsAt, endsAt })
  revalidatePath('/admin/live')
  return { ok: true }
}

export async function createBroadcast(title: string, body: string, style: 'popup' | 'banner', startsAt: string, endsAt: string): Promise<Result> {
  await requireAdminSession()
  const t = title.trim().slice(0, 80)
  if (!t) return { ok: false, message: 'Give the message a title' }
  if (!['popup', 'banner'].includes(style)) return { ok: false, message: 'Pick popup or banner' }
  const bad = checkWindow(startsAt, endsAt)
  if (bad) return { ok: false, message: bad }
  const { error } = await createAdminClient()
    .from('broadcasts')
    .insert({ title: t, body: body.trim().slice(0, 300) || null, style, starts_at: startsAt, ends_at: endsAt })
  if (error) return { ok: false, message: error.message }
  await audit('Scheduled message', t, { style, startsAt, endsAt })
  revalidatePath('/admin/live')
  return { ok: true }
}

export async function createGlobalGift(
  kind: 'bricks' | 'boost' | 'upgrade',
  amount: number,
  upgrade: string | null,
  message: string,
  startsAt: string,
  endsAt: string
): Promise<Result> {
  await requireAdminSession()
  if (!['bricks', 'boost', 'upgrade'].includes(kind)) return { ok: false, message: 'Pick what to give' }
  if (!(amount > 0)) return { ok: false, message: 'Enter an amount' }
  if (kind === 'upgrade' && (!UPGRADES.includes(upgrade ?? '') || !Number.isInteger(amount)))
    return { ok: false, message: 'Pick an upgrade and a whole number' }
  const bad = checkWindow(startsAt, endsAt)
  if (bad) return { ok: false, message: bad }
  const { error } = await createAdminClient()
    .from('global_gifts')
    .insert({
      kind,
      amount,
      upgrade: kind === 'upgrade' ? upgrade : null,
      message: message.trim().slice(0, 140) || null,
      starts_at: startsAt,
      ends_at: endsAt,
    })
  if (error) return { ok: false, message: error.message }
  await audit('Gift to everyone', rewardText(kind, amount, upgrade), { startsAt, endsAt })
  revalidatePath('/admin/live')
  return { ok: true }
}

// A readable name for the audit log.
async function labelOf(table: LiveTable, id: string): Promise<string> {
  const admin = createAdminClient()
  if (table === 'event') {
    const { data } = await admin.from('live_events').select('kind, value').eq('id', id).maybeSingle()
    return data ? eventTitle(data.kind as LiveEventKind, data.value) : id
  }
  if (table === 'broadcast') {
    const { data } = await admin.from('broadcasts').select('title').eq('id', id).maybeSingle()
    return data?.title ?? id
  }
  const { data } = await admin.from('global_gifts').select('kind, amount, upgrade').eq('id', id).maybeSingle()
  return data ? rewardText(data.kind, data.amount, data.upgrade) : id
}

const NOUN: Record<LiveTable, string> = { event: 'event', broadcast: 'message', gift: 'gift to everyone' }

export async function setLiveActive(table: LiveTable, id: string, active: boolean): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from(TABLES[table]).update({ active }).eq('id', id)
  if (error) return { ok: false, message: error.message }
  await audit(`${active ? 'Turned on' : 'Turned off'} ${NOUN[table]}`, await labelOf(table, id))
  return { ok: true }
}

export async function deleteLive(table: LiveTable, id: string): Promise<Result> {
  await requireAdminSession()
  const label = await labelOf(table, id)
  const { error } = await createAdminClient().from(TABLES[table]).delete().eq('id', id)
  if (error) return { ok: false, message: error.message }
  await audit(`Deleted ${NOUN[table]}`, label)
  return { ok: true }
}
