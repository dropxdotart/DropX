import { BLUEPRINT_COUNT, getBricks } from './blueprints'

// A fixed set of named targets, then infinite scaling beyond it by cycling
// the same list with a tier suffix and multiplied stats — gives early-game
// a hand-crafted feel without hand-authoring an endless list.
export type Structure = {
  name: string
  blueprint: number
  maxHealth: number
  reward: number
}

const NAMES = [
  'Garden Shed',
  'Old House',
  'Warehouse',
  'Office Tower',
  'Shopping Mall',
  'Stadium',
  'Cruise Ship',
  'Space Station',
]

export function getStructure(index: number): Structure {
  const tier = Math.floor(index / BLUEPRINT_COUNT)
  const blueprint = index % BLUEPRINT_COUNT
  // Health is tied to brick count so one early hit knocks off about two
  // bricks regardless of building size; the exponential factor is what makes
  // later structures need upgrades rather than just more taps.
  const scale = Math.pow(1.6, index)
  const maxHealth = Math.round(getBricks(blueprint).length * 0.5 * scale)

  return {
    name: tier === 0 ? NAMES[blueprint] : `${NAMES[blueprint]} (Tier ${tier + 1})`,
    blueprint,
    maxHealth,
    reward: Math.round(maxHealth * 0.5),
  }
}
