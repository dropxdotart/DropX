// Types and helpers the ads admin, its server actions and the public
// report page all share (no server-only imports here).

export type AdPlacement = 'rewarded' | 'interstitial' | 'banner' | 'billboard'
export type CampaignStatus = 'active' | 'paused' | 'archived'
export type Audience = 'all' | 'new' | 'returning'

// `size` is the recommended media size for how each placement is shown.
export const PLACEMENTS: { value: AdPlacement; label: string; hint: string; size: string }[] = [
  { value: 'rewarded', label: 'Rewarded', hint: 'Players choose to watch for a reward', size: '1280 × 720' },
  { value: 'interstitial', label: 'Full-screen', hint: 'Between moments, e.g. after a site is cleared', size: '1280 × 720' },
  { value: 'banner', label: 'Banner', hint: 'Strip along the bottom of the screen', size: '1200 × 175' },
  { value: 'billboard', label: 'In-world', hint: 'Billboards, vans and fences in the 3D town', size: '1280 × 720' },
]
export const placementLabel = (p: string) => PLACEMENTS.find((x) => x.value === p)?.label ?? p

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Jerusalem',
  'UTC',
]

export type Campaign = {
  id: string
  name: string
  advertiser: string
  status: CampaignStatus
  placements: AdPlacement[]
  headline: string
  cta_text: string
  cta_url: string | null
  starts_at: string | null
  ends_at: string | null
  days: number[] | null
  hour_from: number | null
  hour_to: number | null
  tz: string
  freq_cap: number | null
  daily_cap: number | null
  total_cap: number | null
  min_level: number | null
  max_level: number | null
  islands: string[] | null
  audience: Audience
  weight: number
  report_token: string
  notes: string
  created_at: string
  updated_at: string
}

export type Creative = {
  id: string
  campaign_id: string
  name: string
  kind: 'image' | 'video'
  media_url: string
  status: 'active' | 'paused'
  created_at: string
}

// What the editor sends.
export type CampaignInput = Omit<Campaign, 'id' | 'report_token' | 'created_at' | 'updated_at' | 'status'> & {
  status: 'active' | 'paused'
}

export const EMPTY_CAMPAIGN: CampaignInput = {
  name: '',
  advertiser: '',
  status: 'active',
  placements: ['rewarded', 'interstitial'],
  headline: '',
  cta_text: 'Learn more',
  cta_url: null,
  starts_at: null,
  ends_at: null,
  days: null,
  hour_from: null,
  hour_to: null,
  tz: 'America/New_York',
  freq_cap: null,
  daily_cap: null,
  total_cap: null,
  min_level: null,
  max_level: null,
  islands: null,
  audience: 'all',
  weight: 1,
  notes: '',
}

// Whether a campaign is actually serving, and if not, why — the first
// thing an admin wants to know about it.
export type Serving = { label: string; tone: 'good' | 'wait' | 'off' | 'warn' }
export function servingState(c: Campaign, liveCreatives: number, now = Date.now()): Serving {
  if (c.status === 'archived') return { label: 'Archived', tone: 'off' }
  if (c.status === 'paused') return { label: 'Paused', tone: 'off' }
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return { label: 'Ended', tone: 'off' }
  if (!c.placements.length) return { label: 'No placements', tone: 'warn' }
  if (!liveCreatives) return { label: 'No ads', tone: 'warn' }
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: 'Scheduled', tone: 'wait' }
  return { label: 'Running', tone: 'good' }
}

// ── Reports ────────────────────────────────────────────────────────────

export type Totals = {
  views: number
  reach: number
  clicks: number
  completes: number
  skips: number
  watchSeconds: number
  bricks: number
}
export const ZERO: Totals = { views: 0, reach: 0, clicks: 0, completes: 0, skips: 0, watchSeconds: 0, bricks: 0 }

export type Report = {
  from: string
  to: string
  totals: Totals
  days: { day: string; views: number; clicks: number; completes: number }[]
  byPlacement: Record<string, Totals>
  byCreative: Record<string, Totals>
  byCampaign: Record<string, Totals>
}

export const ctr = (t: Totals) => (t.views ? t.clicks / t.views : 0)
// Of the plays that finished one way or the other, how many were watched
// through (rewarded: earned; full-screen: played out).
export const completion = (t: Totals) => (t.completes + t.skips ? t.completes / (t.completes + t.skips) : 0)
export const avgWatch = (t: Totals) => (t.completes + t.skips ? t.watchSeconds / (t.completes + t.skips) : 0)

export type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'all'
export const RANGES: { value: RangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]

// The range in the viewer's own time zone, as ISO instants.
export function rangeBounds(range: RangeKey, now = new Date()): { from: string; to: string } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  if (range === 'yesterday') {
    start.setDate(start.getDate() - 1)
    end.setDate(end.getDate() - 1)
  }
  if (range === '7d') start.setDate(start.getDate() - 6)
  if (range === '30d') start.setDate(start.getDate() - 29)
  if (range === 'all') return { from: new Date('2024-01-01').toISOString(), to: end.toISOString() }
  return { from: start.toISOString(), to: end.toISOString() }
}

export const pct = (x: number) => (x >= 0.1 || x === 0 ? `${Math.round(x * 100)}%` : `${(x * 100).toFixed(1)}%`)
export const num = (n: number) => Math.round(n).toLocaleString()
export const secs = (s: number) => (s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`)
