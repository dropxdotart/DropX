import { getBricks } from './blueprints'

// Demolition jobs. You need the player level to see a job as available AND
// pay its contract price to start it; brickValue is what each hauled brick
// pays out, and bonus is paid once when the site is fully cleared.
export type BuildingDef = {
  id: string
  name: string
  blueprint: number
  requiredLevel: number
  contractCost: number
  brickValue: number
  bonus: number
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'shed', name: 'Garden Shed', blueprint: 0, requiredLevel: 1, contractCost: 0, brickValue: 1, bonus: 50 },
  { id: 'house', name: 'Old House', blueprint: 1, requiredLevel: 3, contractCost: 250, brickValue: 2, bonus: 400 },
  { id: 'warehouse', name: 'Warehouse', blueprint: 2, requiredLevel: 5, contractCost: 2_500, brickValue: 5, bonus: 3_000 },
  { id: 'tower', name: 'Office Tower', blueprint: 3, requiredLevel: 8, contractCost: 20_000, brickValue: 12, bonus: 25_000 },
  { id: 'mall', name: 'Shopping Mall', blueprint: 4, requiredLevel: 11, contractCost: 120_000, brickValue: 30, bonus: 150_000 },
  { id: 'stadium', name: 'Stadium', blueprint: 5, requiredLevel: 14, contractCost: 700_000, brickValue: 80, bonus: 900_000 },
  { id: 'ship', name: 'Cruise Ship', blueprint: 6, requiredLevel: 17, contractCost: 4_000_000, brickValue: 220, bonus: 5_000_000 },
  { id: 'station', name: 'Space Station', blueprint: 7, requiredLevel: 20, contractCost: 25_000_000, brickValue: 650, bonus: 30_000_000 },
]

export function getBuilding(id: string): BuildingDef {
  return BUILDINGS.find((b) => b.id === id) ?? BUILDINGS[0]
}

export function brickCount(def: BuildingDef): number {
  return getBricks(def.blueprint).length
}

// Level n needs 60·(n−1)² hauled bricks total: level 2 at 60, level 3 at
// 240, level 5 at 960, level 10 at ~4.9k, level 20 at ~21.7k.
export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(xp / 60)) + 1
}

export function xpForLevel(level: number): number {
  return 60 * (level - 1) * (level - 1)
}
