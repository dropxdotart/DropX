import { trackAdEvent, type AdEvent } from '@/app/actions'
import { playerId } from './player'

// Fire-and-forget: stats must never get in the way of the game.
export function trackAd(adId: string, event: AdEvent, bricks = 0) {
  trackAdEvent(adId, event, playerId(), bricks).catch(() => {})
}
