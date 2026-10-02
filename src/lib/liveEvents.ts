// Game-wide events an admin schedules (see migration 016), as players and
// admins see them.

export type LiveEventKind = 'double_bricks' | 'crew_boost' | 'upgrade_sale' | 'double_xp'

export const EVENT_KINDS: { value: LiveEventKind; label: string; emoji: string; unit: 'times' | 'percent'; default: number }[] = [
  { value: 'double_bricks', label: 'Double bricks', emoji: '🧱', unit: 'times', default: 2 },
  { value: 'crew_boost', label: 'Crew boost', emoji: '⚡', unit: 'times', default: 1.5 },
  { value: 'upgrade_sale', label: 'Upgrade sale', emoji: '🏷️', unit: 'percent', default: 25 },
  { value: 'double_xp', label: 'Double XP', emoji: '⭐', unit: 'times', default: 2 },
]

// Limits on the value: a multiplier, or % off for a sale.
export const EVENT_LIMITS: Record<'times' | 'percent', { min: number; max: number }> = {
  times: { min: 1.1, max: 10 },
  percent: { min: 5, max: 90 },
}

export function eventInfo(kind: LiveEventKind) {
  return EVENT_KINDS.find((k) => k.value === kind) ?? EVENT_KINDS[0]
}

// "Double bricks", "3× bricks", "Crew 1.5× faster", "25% off upgrades", "Double XP"
export function eventTitle(kind: LiveEventKind, value: number): string {
  const v = Math.round(value * 100) / 100
  if (kind === 'double_bricks') return v === 2 ? 'Double bricks' : `${v}× bricks`
  if (kind === 'double_xp') return v === 2 ? 'Double XP' : `${v}× XP`
  if (kind === 'crew_boost') return `Crew ${v}× faster`
  return `${Math.round(value)}% off upgrades`
}

export function eventDetail(kind: LiveEventKind, value: number): string {
  const v = Math.round(value * 100) / 100
  if (kind === 'double_bricks') return `Every brick pays ${v}×`
  if (kind === 'double_xp') return `Level up ${v}× faster`
  if (kind === 'crew_boost') return `Your whole crew works ${v}× faster`
  return `Every upgrade is ${Math.round(value)}% cheaper`
}

// 2h 14m · 45m · 30s
export function timeLeft(endsAt: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}
