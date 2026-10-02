// How codes and gifts describe what they give (admin pages).

export const UPGRADE_OPTIONS: { value: string; label: string }[] = [
  { value: 'workers', label: 'Worker' },
  { value: 'fleet', label: 'Truck' },
  { value: 'yardSize', label: 'Yard expansion' },
  { value: 'yardDocks', label: 'Unloading dock' },
  { value: 'tools', label: 'Better tools level' },
  { value: 'speed', label: 'Walking speed level' },
  { value: 'yardSpeed', label: 'Faster unloading level' },
  { value: 'yardBonus', label: 'Better prices level' },
]

export function rewardText(kind: string, amount: number, upgrade: string | null): string {
  const n = Math.round(Math.abs(amount)).toLocaleString()
  const taken = amount < 0 && kind !== 'set_bricks'
  if (kind === 'bricks') return taken ? `Took 🧱 ${n} bricks` : `🧱 ${n} bricks`
  if (kind === 'set_level') return `Set level to ${n}`
  if (kind === 'set_bricks') return `Set bricks to 🧱 ${n}`
  if (kind === 'boost') return taken ? `Took ⚡ ${n} min boost` : `⚡ ${n} min crew boost`
  if (kind === 'reset') return '↺ Progress reset'
  const label = UPGRADE_OPTIONS.find((u) => u.value === upgrade)?.label ?? upgrade ?? 'upgrade'
  return taken ? `Took ${n}× ${label}` : `${n}× free ${label}`
}
