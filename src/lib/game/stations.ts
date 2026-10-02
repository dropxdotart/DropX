import {
  DUMPSTER,
  LOT_HALF,
  MILESTONES,
  stats,
  truckUpgradeCost,
  upgradeCost,
  upgradeLock,
  dumpsterBuyCost,
  dumpsterUpgradeCost,
  type PlotSnap,
  type Snapshot,
  type UpgradeKey,
  type Upgrades,
} from './engine'

// The tappable, upgradable things on the site. Each one opens its own
// upgrade panel and changes its look at milestone levels.
export type StationId = 'tools' | 'crew' | 'dumpster' | 'truck' | 'yard'

export { MILESTONES }

export type StationDef = {
  id: StationId
  name: string
  emoji: string
  upgrades: UpgradeKey[]
  position: { x: number; z: number }
  // Station level shown to the player (1-based); drives the milestone look.
  level: (u: Upgrades) => number
  tierNames: [string, string, string, string]
  effects: (u: Upgrades) => { label: string; now: string; next: (key: UpgradeKey) => string }[]
}

export const STATIONS: StationDef[] = [
  {
    id: 'tools',
    name: 'Tool Rack',
    emoji: '🔨',
    upgrades: ['tools'],
    position: { x: LOT_HALF - 1.9, z: -LOT_HALF + 1.9 },
    level: (u) => 1 + u.tools,
    tierNames: ['Sledgehammers', 'Jackhammers', 'Loader', 'Excavator'],
    effects: (u) => [
      {
        label: 'Pickup time',
        now: `${stats.pullSeconds(u).toFixed(2)}s`,
        next: () => `${stats.pullSeconds({ ...u, tools: u.tools + 1 }).toFixed(2)}s`,
      },
    ],
  },
  {
    id: 'crew',
    name: 'Crew Trailer',
    emoji: '👷',
    upgrades: ['workers', 'speed'],
    position: { x: -LOT_HALF + 2, z: LOT_HALF - 2.2 },
    level: (u) => 1 + u.workers + u.speed,
    tierNames: ['Tent', 'Portacabin', 'Site Office', 'Site HQ'],
    effects: (u) => [
      {
        label: 'Workers',
        now: `${stats.workerCount(u)}`,
        next: (k) => (k === 'workers' ? `${stats.workerCount(u) + 1}` : `${stats.workerCount(u)}`),
      },
      {
        // Only moves at milestones (new trailer look), so `next` usually
        // matches `now` and no arrow shows.
        label: 'Carries',
        now: `${stats.carry(u)} brick${stats.carry(u) > 1 ? 's' : ''}`,
        next: (k) => {
          const n = stats.carry({ ...u, [k]: u[k] + 1 })
          return `${n} brick${n > 1 ? 's' : ''}`
        },
      },
      {
        label: 'Walking speed',
        now: `${stats.walkSpeed(u).toFixed(1)} m/s`,
        next: (k) => (k === 'speed' ? `${stats.walkSpeed({ ...u, speed: u.speed + 1 }).toFixed(1)} m/s` : `${stats.walkSpeed(u).toFixed(1)} m/s`),
      },
    ],
  },
  {
    // Each plot's dumpsters are bought and sized up one by one in the
    // dumpster panel (DumpsterPanel); this entry is for the map and looks.
    id: 'dumpster',
    name: 'Dumpsters',
    emoji: '🗑️',
    upgrades: [],
    position: { x: DUMPSTER.x, z: DUMPSTER.z },
    level: () => 1,
    tierNames: ['Skip', 'Big Skip', 'Roll-off Container', 'Compactor'],
    effects: () => [],
  },
  {
    // The fleet. Each truck's own load/speed upgrades and look live in the
    // truck panel (TruckPanel); this station is the depot and buying trucks.
    id: 'truck',
    name: 'Trucks',
    emoji: '🚛',
    upgrades: ['fleet'],
    // The depot sign by the Brick Yard's parking (relative to YARD_BLOCK).
    position: { x: -6, z: 6.8 },
    level: (u) => 1 + u.fleet,
    tierNames: ['Flatbed', 'Box Truck', 'Garbage Truck', 'Mega Hauler'],
    effects: (u) => [
      {
        label: 'Trucks',
        now: `${stats.truckCount(u)}`,
        next: () => `${stats.truckCount({ ...u, fleet: u.fleet + 1 })}`,
      },
    ],
  },
  {
    id: 'yard',
    name: 'Brick Yard',
    emoji: '🏭',
    upgrades: ['yardSize', 'yardDocks', 'yardSpeed', 'yardBonus'],
    // Relative to YARD_BLOCK, not a plot.
    position: { x: 2, z: 3 },
    level: (u) => 1 + u.yardSpeed + u.yardBonus,
    tierNames: ['Scrap Heap', 'Brick Yard', 'Recycling Plant', 'Mega Plant'],
    effects: (u) => [
      {
        label: 'Truck parking',
        now: `${stats.yardCapacity(u)} trucks`,
        next: (k) => `${stats.yardCapacity(k === 'yardSize' ? { ...u, yardSize: u.yardSize + 1 } : u)} trucks`,
      },
      {
        label: 'Unloading docks',
        now: `${stats.docks(u)}`,
        next: (k) => `${stats.docks(k === 'yardDocks' ? { ...u, yardDocks: u.yardDocks + 1 } : u)}`,
      },
      {
        label: 'Unload time',
        now: `${stats.unloadSeconds(u).toFixed(1)}s`,
        next: (k) => `${stats.unloadSeconds(k === 'yardSpeed' ? { ...u, yardSpeed: u.yardSpeed + 1 } : u).toFixed(1)}s`,
      },
      {
        label: 'Price bonus',
        now: `+${Math.round(stats.priceBonus(u) * 100)}%`,
        next: (k) => `+${Math.round(stats.priceBonus(k === 'yardBonus' ? { ...u, yardBonus: u.yardBonus + 1 } : u) * 100)}%`,
      },
    ],
  },
]

// A single truck's level drives its look (Flatbed → Mega Hauler).
export function truckLevel(t: { load: number; speed: number }) {
  return 1 + t.load + t.speed
}

// A single dumpster's level drives its look (Skip → Compactor).
export function dumpsterLevel(d: { level: number }) {
  return 1 + d.level
}

// Anything to buy for a plot's dumpsters: another one, or any one bigger.
export function dumpstersAffordable(plot: PlotSnap | undefined, scrap: number): boolean {
  if (!plot) return false
  const buy = dumpsterBuyCost(plot.dumpsters.length)
  if (buy !== null && scrap >= buy) return true
  return plot.dumpsters.some((d) => scrap >= dumpsterUpgradeCost(d.level))
}

// A station upgrade that can be bought now: affordable and not locked
// (yard full, level too low…).
export function upgradeReady(key: UpgradeKey, snap: Snapshot): boolean {
  if (key === 'yardSize' && snap.yardBuild) return false // already building
  return snap.scrap >= upgradeCost(key, snap.upgrades[key]) && !upgradeLock(key, snap.upgrades, snap.level)
}

// Anything to buy for the fleet: another truck, or any truck's upgrade.
export function fleetAffordable(snap: Snapshot): boolean {
  if (upgradeReady('fleet', snap)) return true
  return snap.trucks.some((t) => snap.scrap >= truckUpgradeCost('load', t.load) || snap.scrap >= truckUpgradeCost('speed', t.speed))
}

export function getStation(id: StationId): StationDef {
  return STATIONS.find((s) => s.id === id)!
}

// 0 = starting look, then one tier per milestone reached.
export function tierFor(level: number): number {
  return MILESTONES.filter((m) => level >= m).length
}

export function nextMilestone(level: number): number | null {
  return MILESTONES.find((m) => level < m) ?? null
}
