'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// Ad serving. Campaigns (see migration 020) say where, when, to whom and
// how often; each holds creatives that rotate. The game asks for an ad for
// a placement with a little context about the player, and logs what
// happened with it. Everything runs with the service role on the server.

export type AdPlacement = 'rewarded' | 'interstitial' | 'banner' | 'billboard'
export type AdEvent = 'view' | 'complete' | 'skip' | 'click'

export type AdCreative = {
  id: string // the creative
  campaignId: string
  placement: AdPlacement
  kind: 'image' | 'video'
  media_url: string
  click_url: string | null // the campaign's call-to-action link
  headline: string
  ctaText: string
  advertiser: string
  // How long it must play before it can be closed (interstitial: skip,
  // rewarded: claim). Admin-editable per placement; 0 for banner/billboard.
  unlockSeconds: number
}

// What the game tells the server about the player, for targeting.
export type AdContext = { playerId: string; level: number; islands: string[] }

type Campaign = {
  id: string
  advertiser: string
  placements: string[]
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
  audience: 'all' | 'new' | 'returning'
  weight: number
}
type Media = { id: string; kind: 'image' | 'video'; media_url: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLACEMENTS: AdPlacement[] = ['rewarded', 'interstitial', 'banner', 'billboard']
const DEFAULT_UNLOCK_SECONDS: Record<string, number> = { interstitial: 10, rewarded: 15 }
// A player counts as new for their first week.
const NEW_PLAYER_DAYS = 7

// Weekday (0 = Sunday) and hour right now in a time zone.
function localNow(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date())
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd), hour }
  } catch {
    const d = new Date()
    return { day: d.getUTCDay(), hour: d.getUTCHours() }
  }
}

// Whether a campaign's schedule and audience allow it for this player now
// (caps are checked separately).
function eligible(c: Campaign, ctx: AdContext, isNew: boolean | null) {
  const now = Date.now()
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return false
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return false
  if (c.days?.length || c.hour_from != null || c.hour_to != null) {
    const { day, hour } = localNow(c.tz)
    if (c.days?.length && !c.days.includes(day)) return false
    const from = c.hour_from ?? 0
    const to = c.hour_to ?? 24
    // An overnight window (e.g. 20 → 2) wraps past midnight.
    const inWindow = from <= to ? hour >= from && hour < to : hour >= from || hour < to
    if (!inWindow) return false
  }
  if (c.min_level != null && ctx.level < c.min_level) return false
  if (c.max_level != null && ctx.level > c.max_level) return false
  if (c.islands?.length && !c.islands.some((i) => ctx.islands.includes(i))) return false
  if (c.audience !== 'all' && isNew !== null && (c.audience === 'new') !== isNew) return false
  return true
}

async function unlockSeconds(placement: AdPlacement) {
  const { data } = await createAdminClient().from('ad_settings').select('unlock_seconds').eq('placement', placement).maybeSingle()
  return data?.unlock_seconds ?? DEFAULT_UNLOCK_SECONDS[placement] ?? 0
}

async function isNewPlayer(playerId: string): Promise<boolean | null> {
  if (!UUID.test(playerId)) return null
  const { data } = await createAdminClient().from('players').select('created_at').eq('id', playerId).maybeSingle()
  if (!data) return true // not synced yet: brand new
  return Date.now() - new Date(data.created_at).getTime() < NEW_PLAYER_DAYS * 86_400_000
}

function toCreative(c: Campaign, cr: Media, placement: AdPlacement, unlock: number): AdCreative {
  return {
    id: cr.id,
    campaignId: c.id,
    placement,
    kind: cr.kind,
    media_url: cr.media_url,
    click_url: c.cta_url,
    headline: c.headline,
    ctaText: c.cta_text,
    advertiser: c.advertiser,
    unlockSeconds: unlock,
  }
}

// Campaigns that can show on a placement right now, with their live
// creatives. Per-player frequency caps don't apply to the world's
// billboards, which are scenery rather than one impression each.
async function candidates(placement: AdPlacement, ctx: AdContext, perPlayerCaps: boolean) {
  const admin = createAdminClient()
  const { data: rows } = await admin.from('ad_campaigns').select('*').eq('status', 'active').contains('placements', [placement])
  const camps = (rows ?? []) as Campaign[]
  if (!camps.length) return []
  const isNew = camps.some((c) => c.audience !== 'all') ? await isNewPlayer(ctx.playerId) : null
  let live = camps.filter((c) => eligible(c, ctx, isNew))
  if (live.some((c) => c.freq_cap || c.daily_cap || c.total_cap)) {
    const { data: counts } = await admin.rpc('ad_cap_counts', { p_player: ctx.playerId })
    type Count = { campaign_id: string; total: number; today: number; mine_today: number }
    const by = new Map(((counts ?? []) as Count[]).map((r) => [r.campaign_id, r]))
    live = live.filter((c) => {
      const n = by.get(c.id)
      if (!n) return true
      if (c.total_cap && Number(n.total) >= c.total_cap) return false
      if (c.daily_cap && Number(n.today) >= c.daily_cap) return false
      if (perPlayerCaps && c.freq_cap && Number(n.mine_today) >= c.freq_cap) return false
      return true
    })
  }
  if (!live.length) return []
  const { data: creatives } = await admin
    .from('ad_creatives')
    .select('id, campaign_id, kind, media_url')
    .eq('status', 'active')
    .in(
      'campaign_id',
      live.map((c) => c.id)
    )
  const byCampaign = new Map<string, Media[]>()
  for (const cr of (creatives ?? []) as (Media & { campaign_id: string })[]) {
    byCampaign.set(cr.campaign_id, [...(byCampaign.get(cr.campaign_id) ?? []), cr])
  }
  return live.filter((c) => byCampaign.has(c.id)).map((c) => ({ campaign: c, creatives: byCampaign.get(c.id)! }))
}

// One ad for a placement: a campaign picked by weight, then one of its
// creatives at random.
export async function pickAd(placement: AdPlacement, ctx: AdContext): Promise<AdCreative | null> {
  if (!PLACEMENTS.includes(placement)) return null
  const [list, unlock] = await Promise.all([candidates(placement, ctx, true), unlockSeconds(placement)])
  if (!list.length) return null
  let roll = Math.random() * list.reduce((n, x) => n + x.campaign.weight, 0)
  const pick = list.find((x) => (roll -= x.campaign.weight) <= 0) ?? list[list.length - 1]
  const cr = pick.creatives[Math.floor(Math.random() * pick.creatives.length)]
  return toCreative(pick.campaign, cr, placement, unlock)
}

// Every billboard creative that can show right now — the 3D world spreads
// them over its signs, trucks and fences.
export async function worldAds(ctx: AdContext): Promise<AdCreative[]> {
  const list = await candidates('billboard', ctx, false)
  return list.flatMap((x) => x.creatives.map((cr) => toCreative(x.campaign, cr, 'billboard', 0)))
}

// Logs what happened with an ad, for reports. `seconds`: how long a video
// played; `bricks`: what a rewarded ad paid out.
export async function logAdEvent(input: {
  creativeId: string
  campaignId: string
  placement: AdPlacement
  event: AdEvent
  playerId: string
  seconds?: number
  bricks?: number
}): Promise<void> {
  if (!UUID.test(input.creativeId) || !UUID.test(input.campaignId) || !UUID.test(input.playerId)) return
  if (!PLACEMENTS.includes(input.placement)) return
  if (!['view', 'complete', 'skip', 'click'].includes(input.event)) return
  const seconds = Number.isFinite(input.seconds) ? Math.max(0, Math.min(600, input.seconds ?? 0)) : 0
  const bricks = Number.isFinite(input.bricks) ? Math.max(0, Math.min(1e9, Math.round(input.bricks ?? 0))) : 0
  await createAdminClient().from('ad_log').insert({
    campaign_id: input.campaignId,
    creative_id: input.creativeId,
    placement: input.placement,
    event: input.event,
    player_id: input.playerId,
    seconds,
    bricks,
  })
}
