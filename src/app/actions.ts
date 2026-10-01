'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AdCreative = {
  id: string
  kind: 'image' | 'video'
  media_url: string
  click_url: string | null
  // How long it must play before it can be closed (interstitial: skip,
  // rewarded: claim). Admin-editable per ad type; 0 for banner/billboard.
  unlockSeconds: number
}

const DEFAULT_UNLOCK_SECONDS: Record<string, number> = { interstitial: 10, rewarded: 15 }

// Players never sign in, so this reads through the plain anon client — RLS
// grants `anon` select on active ads specifically for this (see migration
// 001). Picks randomly among active ads for the given placement so a
// handful of creatives rotate instead of always showing the newest.
export async function getAdByPlacement(placement: 'rewarded' | 'interstitial' | 'banner' | 'billboard'): Promise<AdCreative | null> {
  const supabase = await createClient()
  // RLS only returns assignments and uploads that are on and inside their
  // schedules; the inner join drops assignments whose upload isn't live.
  const [{ data }, { data: setting }] = await Promise.all([
    supabase
      .from('ads')
      .select('id, ad_media!inner(kind, media_url, click_url)')
      .eq('active', true)
      .eq('placement', placement),
    supabase.from('ad_settings').select('unlock_seconds').eq('placement', placement).maybeSingle(),
  ])
  if (!data || data.length === 0) return null
  const pick = data[Math.floor(Math.random() * data.length)]
  const media = (Array.isArray(pick.ad_media) ? pick.ad_media[0] : pick.ad_media) as {
    kind: 'image' | 'video'
    media_url: string
    click_url: string | null
  }
  // `id` is the assignment, so stats are recorded per ad type.
  const ad = { id: pick.id, kind: media.kind, media_url: media.media_url, click_url: media.click_url }
  return { ...ad, unlockSeconds: setting?.unlock_seconds ?? DEFAULT_UNLOCK_SECONDS[placement] ?? 0 }
}

export type AdEvent = 'view' | 'complete' | 'skip' | 'click'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Records what happened with an ad, for the admin stats. `playerId` is an
// anonymous per-device id (see lib/adTracking.ts). Written with the
// service role: anon has no access to ad_events.
export async function trackAdEvent(adId: string, event: AdEvent, playerId: string, bricks = 0): Promise<void> {
  if (!UUID.test(adId) || !UUID.test(playerId)) return
  if (!['view', 'complete', 'skip', 'click'].includes(event)) return
  const amount = Number.isFinite(bricks) ? Math.max(0, Math.min(1e9, Math.round(bricks))) : 0
  await createAdminClient().from('ad_events').insert({ ad_id: adId, event, player_id: playerId, bricks: amount })
}
