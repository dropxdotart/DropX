const PLAYER_KEY = 'rubble-player-id'

// This device's random player id: the key to its cloud save, gifts and
// code redemptions (players don't sign in). Kept on the device; players
// see a short public id instead (see playerActions.ts).
export function playerId(): string {
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
