'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { BUILDINGS } from '@/lib/game/buildings'
import { requireAdminSession } from './auth'

// Read-only numbers for the admin dashboard, the player activity log,
// building stats and the audit log (see migration 013).

const DAY = 24 * 60 * 60 * 1000

export type TopPlayer = {
  id: string
  short_id: string
  username: string | null
  level: number
  scrap: number
  sites_cleared: number
  play_seconds: number
}

export type TopSort = 'level' | 'scrap' | 'sites_cleared' | 'play_seconds'

export type Dashboard = {
  players: number
  newToday: number
  newWeek: number
  activeToday: number
  activeWeek: number
  returningWeek: number // played on 2+ different days this week
  sessionsWeek: number
  avgSessionSeconds: number
  playSecondsWeek: number
  bricksInGame: number
  top: Record<TopSort, TopPlayer[]>
}

const TOP_FIELDS = 'id, short_id, username, level, scrap, sites_cleared, play_seconds'
const SORTS: TopSort[] = ['level', 'scrap', 'sites_cleared', 'play_seconds']

async function count(query: PromiseLike<{ count: number | null }>) {
  return (await query).count ?? 0
}

export async function getDashboard(): Promise<Dashboard> {
  await requireAdminSession()
  const admin = createAdminClient()
  // Old activity is dropped here (as well as now and then on sync).
  await admin.rpc('prune_activity')

  const now = Date.now()
  const today = new Date(now - DAY).toISOString()
  const week = new Date(now - 7 * DAY).toISOString()
  const head = { count: 'exact' as const, head: true }

  const [players, newToday, newWeek, activeToday, activeWeek, totals, ...tops] = await Promise.all([
    count(admin.from('players').select('id', head)),
    count(admin.from('players').select('id', head).gte('created_at', today)),
    count(admin.from('players').select('id', head).gte('created_at', week)),
    count(admin.from('players').select('id', head).gte('last_seen', today)),
    count(admin.from('players').select('id', head).gte('last_seen', week)),
    admin.rpc('dashboard_totals'),
    ...SORTS.map((s) => admin.from('players').select(TOP_FIELDS).order(s, { ascending: false }).limit(10)),
  ])

  const t = (totals.data ?? {}) as { returning_week?: number; sessions_week?: number; play_seconds_week?: number; bricks_in_game?: number }
  const sessionsWeek = Number(t.sessions_week ?? 0)
  const playSecondsWeek = Number(t.play_seconds_week ?? 0)

  return {
    players,
    newToday,
    newWeek,
    activeToday,
    activeWeek,
    returningWeek: Number(t.returning_week ?? 0),
    sessionsWeek,
    avgSessionSeconds: sessionsWeek ? playSecondsWeek / sessionsWeek : 0,
    playSecondsWeek,
    bricksInGame: Number(t.bricks_in_game ?? 0),
    top: Object.fromEntries(SORTS.map((s, i) => [s, (tops[i].data ?? []) as TopPlayer[]])) as Record<TopSort, TopPlayer[]>,
  }
}

// ── A player's activity ──────────────────────────────────────────────────

export type ActivityItem =
  | { type: 'session'; at: string; seconds: number }
  | { type: 'building'; at: string; kind: 'building_started' | 'building_finished'; name: string; seconds: number | null }
  | { type: 'ad'; at: string; event: string; placement: string | null; bricks: number }

// Visits, buildings and ads, newest first (the last 90 days).
export async function getPlayerActivity(playerId: string): Promise<ActivityItem[]> {
  await requireAdminSession()
  const admin = createAdminClient()
  const [sessions, events, ads] = await Promise.all([
    admin.from('player_sessions').select('started_at, seconds').eq('player_id', playerId).order('started_at', { ascending: false }).limit(100),
    admin
      .from('player_events')
      .select('kind, building_name, seconds, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('ad_events')
      .select('event, bricks, created_at, ads(placement)')
      .eq('player_id', playerId)
      .in('event', ['complete', 'skip', 'click'])
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  const items: ActivityItem[] = [
    ...(sessions.data ?? []).map((s) => ({ type: 'session' as const, at: s.started_at, seconds: s.seconds })),
    ...(events.data ?? []).map((e) => ({
      type: 'building' as const,
      at: e.created_at,
      kind: e.kind as 'building_started' | 'building_finished',
      name: e.building_name,
      seconds: e.seconds,
    })),
    ...(ads.data ?? []).map((a) => {
      const ad = a.ads as unknown as { placement: string } | { placement: string }[] | null
      const placement = Array.isArray(ad) ? (ad[0]?.placement ?? null) : (ad?.placement ?? null)
      return { type: 'ad' as const, at: a.created_at, event: a.event, placement, bricks: a.bricks }
    }),
  ]
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150)
}

// ── Building stats ───────────────────────────────────────────────────────

export type BuildingStat = {
  building: string
  name: string
  started: number
  finished: number
  avgSeconds: number | null
  medianSeconds: number | null
}

// Per building over the last 90 days: how many players started and
// finished it, and how long it took (time spent demolishing, including
// while away).
export async function getBuildingStats(): Promise<BuildingStat[]> {
  await requireAdminSession()
  const { data, error } = await createAdminClient().rpc('building_stats')
  if (error) throw new Error(error.message)
  type Row = { building: string; building_name: string; started: number; finished: number; avg_seconds: number | null; median_seconds: number | null }
  const rows = new Map(((data ?? []) as Row[]).map((r) => [r.building, r]))
  // Every built-in shows, even before anyone has played it.
  const ids = [...BUILDINGS.map((b) => b.id), ...[...rows.keys()].filter((id) => !BUILDINGS.some((b) => b.id === id))]
  return ids.map((id) => {
    const r = rows.get(id)
    return {
      building: id,
      name: r?.building_name ?? BUILDINGS.find((b) => b.id === id)?.name ?? id,
      started: Number(r?.started ?? 0),
      finished: Number(r?.finished ?? 0),
      avgSeconds: r?.avg_seconds ?? null,
      medianSeconds: r?.median_seconds ?? null,
    }
  })
}

// ── Audit log ────────────────────────────────────────────────────────────

export type AuditRow = { id: number; action: string; target: string | null; details: Record<string, unknown> | null; created_at: string }

// Newest first, 100 at a time (`before` = the last id already shown).
export async function listAudit(before?: number): Promise<AuditRow[]> {
  await requireAdminSession()
  let q = createAdminClient().from('admin_audit').select('id, action, target, details, created_at').order('id', { ascending: false }).limit(100)
  if (before) q = q.lt('id', before)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as AuditRow[]
}
