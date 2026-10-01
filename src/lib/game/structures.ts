// A fixed set of named targets, then infinite scaling beyond it by cycling
// the same list with a tier suffix and multiplied stats — gives early-game
// a hand-crafted feel without hand-authoring an endless list.
export type Structure = {
  name: string
  icon: string
  maxHealth: number
  reward: number
}

const BASE_STRUCTURES: Omit<Structure, 'maxHealth' | 'reward'>[] = [
  { name: 'Garden Shed', icon: '🏚️' },
  { name: 'Old House', icon: '🏠' },
  { name: 'Warehouse', icon: '🏭' },
  { name: 'Office Tower', icon: '🏢' },
  { name: 'Shopping Mall', icon: '🏬' },
  { name: 'Stadium', icon: '🏟️' },
  { name: 'Cruise Ship', icon: '🚢' },
  { name: 'Space Station', icon: '🛰️' },
]

export function getStructure(index: number): Structure {
  const tier = Math.floor(index / BASE_STRUCTURES.length)
  const base = BASE_STRUCTURES[index % BASE_STRUCTURES.length]
  const scale = Math.pow(1.6, index)

  return {
    name: tier === 0 ? base.name : `${base.name} (Tier ${tier + 1})`,
    icon: base.icon,
    maxHealth: Math.round(20 * scale),
    reward: Math.round(15 * scale),
  }
}
