import type { IslandId } from './islands'
import { DESIGN, getBlueprintSize, getBricks, type Brick } from './blueprints'
import { bricksFromCells, decodeCells, type Shape, type ShapeSize } from './shapes'

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
  // Admin-made buildings (see shapes.ts): their stored shape and emoji,
  // and whether they can be started right now (on + in schedule).
  shape?: Shape
  emoji?: string
  available?: boolean
  endsAt?: string // a limited-time building's last moment to start it
  toughness?: number // bricks take this many times longer to work loose (default 1)
  harbour?: boolean // too big for a city plot: only on a harbour lot
  island?: IslandId // which island it's built on (default: the City)
}

export const BUILDINGS: BuildingDef[] = [
  // Houses island (prices are placeholders until the rebalance pass)
  { id: 'shed', island: 'houses', name: 'Garden Shed', blueprint: DESIGN.shed, requiredLevel: 1, contractCost: 0, brickValue: 1, bonus: 50 },
  { id: 'garage', island: 'houses', name: 'Garage', blueprint: DESIGN.garage, requiredLevel: 2, contractCost: 100, brickValue: 1, bonus: 150 },
  { id: 'cottage', island: 'houses', name: 'Cottage', blueprint: DESIGN.cottage, requiredLevel: 3, contractCost: 300, brickValue: 1, bonus: 400 },
  { id: 'house', island: 'houses', name: 'Old House', blueprint: DESIGN.oldHouse, requiredLevel: 4, contractCost: 800, brickValue: 2, bonus: 900 },
  { id: 'shop', island: 'houses', name: 'Corner Shop', blueprint: DESIGN.cornerShop, requiredLevel: 5, contractCost: 2_000, brickValue: 2, bonus: 2_000 },
  { id: 'townhouses', island: 'houses', name: 'Townhouses', blueprint: DESIGN.townhouses, requiredLevel: 6, contractCost: 5_000, brickValue: 3, bonus: 5_000 },
  { id: 'school', island: 'houses', name: 'School', blueprint: DESIGN.school, requiredLevel: 7, contractCost: 12_000, brickValue: 4, bonus: 12_000 },
  // City
  { id: 'warehouse', name: 'Warehouse', blueprint: DESIGN.warehouse, requiredLevel: 8, contractCost: 25_000, brickValue: 5, bonus: 25_000 },
  { id: 'apartments', name: 'Apartments', blueprint: DESIGN.apartments, requiredLevel: 9, contractCost: 50_000, brickValue: 6, bonus: 50_000 },
  { id: 'tower', name: 'Office Tower', blueprint: DESIGN.officeTower, requiredLevel: 10, contractCost: 100_000, brickValue: 8, bonus: 100_000 },
  { id: 'hotel', name: 'Hotel', blueprint: DESIGN.hotel, requiredLevel: 11, contractCost: 250_000, brickValue: 12, bonus: 250_000 },
  { id: 'mall', name: 'Shopping Mall', blueprint: DESIGN.mall, requiredLevel: 12, contractCost: 600_000, brickValue: 20, bonus: 600_000 },
  { id: 'hospital', name: 'Hospital', blueprint: DESIGN.hospital, requiredLevel: 13, contractCost: 1_500_000, brickValue: 35, bonus: 1_500_000 },
  { id: 'stadium', name: 'Stadium', blueprint: DESIGN.stadium, requiredLevel: 14, contractCost: 4_000_000, brickValue: 60, bonus: 4_000_000, toughness: 1.25, harbour: true },
  { id: 'ship', name: 'Cruise Ship', blueprint: DESIGN.cruiseShip, requiredLevel: 15, contractCost: 10_000_000, brickValue: 120, bonus: 10_000_000, toughness: 1.5, harbour: true },
  // Industrial island
  { id: 'factory', island: 'industrial', name: 'Factory', blueprint: DESIGN.factory, requiredLevel: 16, contractCost: 1_500_000, brickValue: 250, bonus: 3_000_000, toughness: 1.3 },
  { id: 'power', island: 'industrial', name: 'Power Plant', blueprint: DESIGN.powerPlant, requiredLevel: 17, contractCost: 3_000_000, brickValue: 400, bonus: 6_000_000, toughness: 1.5 },
  { id: 'refinery', island: 'industrial', name: 'Refinery', blueprint: DESIGN.refinery, requiredLevel: 19, contractCost: 6_000_000, brickValue: 700, bonus: 12_000_000, toughness: 1.7 },
  { id: 'steel', island: 'industrial', name: 'Steel Mill', blueprint: DESIGN.steelMill, requiredLevel: 21, contractCost: 12_000_000, brickValue: 1_200, bonus: 24_000_000, toughness: 2 },
]

// Admin-made buildings known to this game (from the server, the local
// cache, or a save that's demolishing one).
const custom = new Map<string, BuildingDef>()

export function registerCustomBuildings(defs: BuildingDef[], replace = true) {
  for (const d of defs) if (replace || !custom.has(d.id)) custom.set(d.id, d)
}

// The pre-2026-10-02 versions of the big buildings (blueprints 8–11), for
// saves that were already demolishing one. Same names and pay as before;
// never offered in the picker.
export const LEGACY_BUILDINGS: BuildingDef[] = [
  { id: 'mall-v1', name: 'Shopping Mall', blueprint: 8, requiredLevel: 11, contractCost: 120_000, brickValue: 30, bonus: 150_000 },
  { id: 'stadium-v1', name: 'Stadium', blueprint: 9, requiredLevel: 14, contractCost: 700_000, brickValue: 80, bonus: 900_000, harbour: true },
  { id: 'ship-v1', name: 'Cruise Ship', blueprint: 10, requiredLevel: 17, contractCost: 4_000_000, brickValue: 220, bonus: 5_000_000, harbour: true },
  // Taken out of the picker 2026-10-02 (space belongs to a future world);
  // kept so a save already demolishing one can finish it.
  { id: 'station', name: 'Space Station', blueprint: 7, requiredLevel: 20, contractCost: 25_000_000, brickValue: 650, bonus: 30_000_000, toughness: 1.45 },
  { id: 'station-v1', name: 'Space Station', blueprint: 11, requiredLevel: 20, contractCost: 25_000_000, brickValue: 650, bonus: 30_000_000 },
]

// The old version of a redesigned built-in, if it has one.
export function legacyOf(id: string): BuildingDef | null {
  return LEGACY_BUILDINGS.find((b) => b.id === `${id}-v1`) ?? null
}

export function getBuilding(id: string): BuildingDef {
  return BUILDINGS.find((b) => b.id === id) ?? LEGACY_BUILDINGS.find((b) => b.id === id) ?? custom.get(id) ?? BUILDINGS[0]
}

// What the building picker offers: the built-ins plus admin buildings that
// are on and in schedule, by unlock level.
export function pickableBuildings(): BuildingDef[] {
  return [...BUILDINGS, ...[...custom.values()].filter((b) => b.available)].sort(
    (a, b) => a.requiredLevel - b.requiredLevel || a.contractCost - b.contractCost
  )
}

const shapeCache = new Map<string, Brick[]>()

export function bricksFor(def: BuildingDef): Brick[] {
  if (!def.shape) return getBricks(def.blueprint)
  const key = `${def.id}:${def.shape.data}`
  let bricks = shapeCache.get(key)
  if (!bricks) {
    bricks = bricksFromCells(def.shape.size, decodeCells(def.shape.size, def.shape.data))
    shapeCache.set(key, bricks)
  }
  return bricks
}

export function sizeFor(def: BuildingDef): ShapeSize {
  return def.shape ? def.shape.size : getBlueprintSize(def.blueprint)
}

export function brickCount(def: BuildingDef): number {
  return bricksFor(def).length
}

// Balanced numbers for an admin building at a given unlock level, read off
// the built-ins' curve (log scale between them, extended past the last).
export function suggestPricing(level: number, bricks: number) {
  const pts = BUILDINGS.map((b) => ({ l: b.requiredLevel, value: b.brickValue, contract: Math.max(1, b.contractCost), bonus: b.bonus }))
  const at = (key: 'value' | 'contract' | 'bonus') => {
    const L = Math.max(1, level)
    let i = pts.findIndex((p) => p.l >= L)
    if (i === -1) i = pts.length - 1
    if (i === 0) i = 1
    const a = pts[i - 1]
    const b = pts[i]
    const t = (L - a.l) / (b.l - a.l)
    return Math.exp(Math.log(a[key]) + (Math.log(b[key]) - Math.log(a[key])) * t)
  }
  const nice = (n: number) => {
    if (n < 10) return Math.max(1, Math.round(n))
    const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1)
    return Math.round(n / mag) * mag
  }
  // Pay per brick keeps the total payout in line with a built-in of this
  // level even if the building is much bigger or smaller.
  const typicalBricks = 1300
  const value = at('value') * Math.min(2, Math.max(0.5, typicalBricks / Math.max(1, bricks)))
  return {
    contractCost: level <= 1 ? 0 : nice(at('contract')),
    brickValue: nice(value),
    bonus: nice(at('bonus')),
  }
}

// Hauled bricks needed for each level (index = level). Fitted to a
// simulated idle player so the Houses island is the first day, the City
// opens around day 1 and the Steel Mill (Lv 21) about day 7. Past the
// table, levels keep getting harder at the same rate.
export const XP_TABLE: number[] = [0, 0, 120, 560, 1_700, 3_700, 9_700, 42_000, 220_000, 380_000, 560_000, 820_000, 1_100_000, 1_450_000, 1_800_000, 2_150_000, 2_550_000, 2_900_000, 3_250_000, 3_600_000, 4_000_000, 4_500_000]

export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  if (level < XP_TABLE.length) return XP_TABLE[level]
  const last = XP_TABLE[XP_TABLE.length - 1]
  return Math.round(last * Math.pow(1.18, level - (XP_TABLE.length - 1)))
}

export function levelForXp(xp: number): number {
  let level = 1
  while (xpForLevel(level + 1) <= xp && level < 999) level++
  return level
}
