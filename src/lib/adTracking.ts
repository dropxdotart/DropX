import { logAdEvent, pickAd, worldAds, type AdContext, type AdCreative, type AdEvent, type AdPlacement } from '@/app/actions'
import { getEngine } from './game/engine'
import { levelForXp } from './game/buildings'
import { ISLANDS } from './game/islands'
import { playerId } from './player'

// The game's side of ads: who is asking (for targeting), and
// fire-and-forget logging — ads must never get in the way of the game.

export function adContext(): AdContext {
  try {
    const e = getEngine()
    return { playerId: playerId(), level: levelForXp(e.xp), islands: ISLANDS.filter((s) => e.islandOpen(s.id)).map((s) => s.id) }
  } catch {
    return { playerId: playerId(), level: 1, islands: [] }
  }
}

export function fetchAd(placement: AdPlacement): Promise<AdCreative | null> {
  return pickAd(placement, adContext()).catch(() => null)
}

export function fetchWorldAds(): Promise<AdCreative[]> {
  return worldAds(adContext()).catch(() => [])
}

export function trackAd(ad: AdCreative, event: AdEvent, extra: { seconds?: number; bricks?: number } = {}) {
  logAdEvent({ creativeId: ad.id, campaignId: ad.campaignId, placement: ad.placement, event, playerId: playerId(), ...extra }).catch(() => {})
}
