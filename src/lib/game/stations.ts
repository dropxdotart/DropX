import { DUMPSTER, LOT_HALF, MILESTONES, TRUCK_STOP, stats, type UpgradeKey, type Upgrades } from './engine'

// The tappable, upgradable things on the site. Each one opens its own
// upgrade panel and changes its look at milestone levels.
export type StationId = 'tools' | 'crew' | 'dumpster' | 'truck'

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
        label: 'Worker pull time',
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
    id: 'dumpster',
    name: 'Dumpster',
    emoji: '🗑️',
    upgrades: ['dumpster'],
    position: { x: DUMPSTER.x, z: DUMPSTER.z },
    level: (u) => 1 + u.dumpster,
    tierNames: ['Skip', 'Big Skip', 'Roll-off Container', 'Compactor'],
    effects: (u) => [
      {
        label: 'Holds',
        now: `${stats.dumpsterCapacity(u)} bricks`,
        next: () => `${stats.dumpsterCapacity({ ...u, dumpster: u.dumpster + 1 })} bricks`,
      },
    ],
  },
  {
    id: 'truck',
    name: 'Truck',
    emoji: '🚛',
    upgrades: ['truck', 'fleet'],
    position: { x: TRUCK_STOP.x, z: TRUCK_STOP.z },
    level: (u) => 1 + u.truck + u.fleet,
    tierNames: ['Flatbed', 'Box Truck', 'Garbage Truck', 'Mega Hauler'],
    effects: (u) => [
      {
        label: 'Trucks',
        now: `${stats.truckCount(u)}`,
        next: (k) => `${stats.truckCount(k === 'fleet' ? { ...u, fleet: u.fleet + 1 } : u)}`,
      },
      {
        label: 'Load per trip',
        now: `${stats.truckCargo(u)} bricks`,
        next: (k) => `${stats.truckCargo(k === 'truck' ? { ...u, truck: u.truck + 1 } : u)} bricks`,
      },
      {
        label: 'Round trip',
        now: `${stats.truckTripSeconds(u).toFixed(1)}s`,
        next: (k) => `${stats.truckTripSeconds(k === 'truck' ? { ...u, truck: u.truck + 1 } : u).toFixed(1)}s`,
      },
    ],
  },
]

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
