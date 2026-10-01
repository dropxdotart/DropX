import { trackAdEvent, type AdEvent } from '@/app/actions'

const PLAYER_KEY = 'rubble-player-id'

// Anonymous id for this device, so the admin can count unique players
// without anyone signing in.
function playerId(): string {
  try {
    let id = localStorage.getItem(PLAYER_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(PLAYER_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

// Fire-and-forget: stats must never get in the way of the game.
export function trackAd(adId: string, event: AdEvent, bricks = 0) {
  trackAdEvent(adId, event, playerId(), bricks).catch(() => {})
}
