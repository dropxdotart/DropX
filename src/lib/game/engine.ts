import { type Brick, type BrickColor } from './blueprints'
import { BUILDINGS, brickCount, bricksFor, getBuilding, legacyOf, levelForXp, registerCustomBuildings, sizeFor, xpForLevel, type BuildingDef } from './buildings'
import { PLOT_SLOTS } from './plots'
import { ISLANDS, islandAt, type IslandId } from './islands'
import {
  dockPoint,
  MAX_DOCKS,
  kerbPath,
  kerbSpot,
  KERB_INSET,
  parkingSpot,
  parkPath,
  unparkPath,
  yardCapacity,
  YARD_MAX_SIZE,
  planRoute,
  plotStop,
  routeLength,
  yardGateIn,
  yardGateOut,
  yardEnterPath,
  yardExitPath,
  type Point,
  type RoadSpot,
} from './roads'

// The whole game simulation lives here, outside React: workers walking and
// carrying, rubble on the ground, the dumpsters and trucks, and the economy.
// Each plot you own is a Site with its own building, rubble, dumpster and
// truck run; the crew is one shared pool split across the plots. Positions
// inside a site are local to that plot's block (see plots.ts).
// The 3D scene advances it once per frame and draws whatever it says; the
// HUD subscribes to a throttled snapshot. Keeping it framework-free also
// means the same logic can be ported to the native app later.

import { BRICK, DUMPSTER, DUMPSTER_SLOTS, LOT_HALF, MAX_DUMPSTERS } from './layout'
import { eventDetail, eventInfo, eventTitle, type LiveEventKind } from '../liveEvents'
import { cleanTuning, DEFAULT_TUNING, type TuneKey, type Tuning } from '../tuning'
export { BRICK, DUMPSTER, DUMPSTER_SLOTS, LOT_HALF, MAX_DUMPSTERS, ROAD_Z, TRUCK_STOP } from './layout'

// v6: the island world (a fresh start, pre-launch).
const SAVE_KEY = 'rubble-save-v6'
const LEGACY_SAVE_KEY = 'rubble-save-v4'
// Set when an admin reset wipes the save, so the fresh game can say so;
// gifts sent after the reset wait here to be applied to the fresh game.
const RESET_NOTICE_KEY = 'rubble-reset-notice'
// Longest dumpster line; anyone else waits aside with their bricks.
const MAX_LINE = 6
const RESTORE_NOTICE_KEY = 'rubble-restore-notice'
const BAN_KEY = 'rubble-ban'
const SEEN_LIVE_KEY = 'rubble-seen-live' // events/messages already popped up
const DISMISSED_KEY = 'rubble-dismissed-banners'
export const PENDING_GRANTS_KEY = 'rubble-pending-grants'
export const CUSTOM_BUILDINGS_KEY = 'rubble-custom-buildings'
// Time away counts up to a full night.
const MAX_OFFLINE_SECONDS = 12 * 60 * 60
// Compute spent replaying time away before the rest is estimated from the
// pace measured during the replay.
const MAX_REPLAY_MS = 5000
const LOAD_SECONDS = 0.8
const BREAK_FALL_SECONDS = 0.7
// Tapping rubble gives the whole crew a short speed burst. No cooldown:
// every tap tops it back up to the full few seconds, so you can spam it.
export const BOOST_SECONDS = 3
const BOOST_FACTOR = 2

// Bonus drop: every few minutes a trailer passes on the front road and
// spills bricks on the sidewalk; watching an ad tips them straight into the
// dumpster (ignoring its limit), otherwise they're swept away.
export const BONUS_LIFETIME_SECONDS = 30
export const TRAILER_SECONDS = 7
export const TRAILER_FAR = 34
export const BONUS_SPOT = { x: 5.5, z: LOT_HALF + 0.7 }
const TRAILER_DROP_AT = (TRAILER_FAR - BONUS_SPOT.x) / (TRAILER_FAR * 2)
const nextBonusDelay = () => 180 + Math.random() * 120

// Site-wide upgrades. Each truck and each dumpster also has its own level.
export type Upgrades = {
  tools: number
  speed: number
  workers: number
  fleet: number
  yardSize: number // Brick Yard expansions (size = 1 + this)
  yardMax?: number // the size this yard can't grow past (set per yard)
  yardDocks: number // extra unloading docks (docks = 1 + this)
  yardSpeed: number
  yardBonus: number
}
export type UpgradeKey = Exclude<keyof Upgrades, 'yardMax'>

export const UPGRADE_INFO: Record<UpgradeKey, { label: string; base: number; growth: number }> = {
  tools: { label: 'Better tools', base: 15, growth: 1.5 },
  speed: { label: 'Walking speed', base: 25, growth: 1.45 },
  workers: { label: 'Hire worker', base: 40, growth: 1.7 },
  fleet: { label: 'Buy a truck', base: 300, growth: 2.6 },
  yardSize: { label: 'Expand the yard', base: 1000, growth: 6.5 },
  yardDocks: { label: 'Add an unloading dock', base: 5000, growth: 10 },
  yardSpeed: { label: 'Faster unloading', base: 60, growth: 1.55 },
  yardBonus: { label: 'Better prices', base: 120, growth: 1.7 },
}

// Each dumpster is bought per plot and sized up on its own.
export const DUMPSTER_UPGRADE = { label: 'Bigger dumpster', base: 30, growth: 1.5 }
// ── Balance sliders (admin, see tuning.ts) ──────────────────────────────

let tuning: Tuning = { ...DEFAULT_TUNING }
const TUNING_KEY = 'rubble-tuning'
// A slider as a factor: 1 = as designed.
const T = (k: TuneKey) => tuning[k] / 100

export function setTuning(raw: unknown) {
  tuning = cleanTuning(raw)
  try {
    localStorage.setItem(TUNING_KEY, JSON.stringify(tuning))
  } catch {
    // fine — the next sync sends it again
  }
}

function loadTuning() {
  try {
    const raw = localStorage.getItem(TUNING_KEY)
    if (raw) tuning = cleanTuning(JSON.parse(raw))
  } catch {
    // defaults
  }
}

// What a building contract / a plot costs right now.
export function buildPrice(cost: number) {
  return Math.round(cost * T('buildPrices'))
}

// ── Live events (admin-scheduled, see liveEvents.ts) ────────────────────

export type LiveEvent = { id: string; kind: LiveEventKind; value: number; startsAt: string; endsAt: string }
export type Broadcast = { id: string; title: string; body: string | null; style: 'popup' | 'banner'; endsAt: string }

// The events currently known (from the last sync). Module-level so the
// price functions below can apply a sale.
let liveEvents: LiveEvent[] = []

// The real-world time the simulation is at: "now", or earlier while time
// away is being replayed (so an event only counts for when it was on).
let simClockOffsetMs = 0
const simNow = () => Date.now() - simClockOffsetMs

function eventsLive(kind: LiveEventKind, at = simNow()) {
  return liveEvents.filter((e) => e.kind === kind && new Date(e.startsAt).getTime() <= at && new Date(e.endsAt).getTime() > at)
}

// Multiplier from live events of a kind (1 when none).
export function eventMultiplier(kind: Exclude<LiveEventKind, 'upgrade_sale'>): number {
  return eventsLive(kind).reduce((m, e) => m * e.value, 1)
}

// Price factor from live sales (e.g. 0.75 for 25% off).
function saleFactor(): number {
  return Math.max(0.1, eventsLive('upgrade_sale', Date.now()).reduce((f, e) => f * (1 - e.value / 100), 1))
}

// Upgrade prices: the slider and any sale.
const priceFactor = () => T('upgradePrices') * saleFactor()

export function dumpsterUpgradeCost(level: number): number {
  return Math.round(DUMPSTER_UPGRADE.base * Math.pow(DUMPSTER_UPGRADE.growth, level) * priceFactor())
}
// Price of a plot's 2nd and 3rd dumpster.
const DUMPSTER_BUY_COSTS = [0, 400, 2500]
export function dumpsterBuyCost(owned: number): number | null {
  return owned < MAX_DUMPSTERS ? Math.round(DUMPSTER_BUY_COSTS[owned] * priceFactor()) : null
}

export type RewardKind = 'bricks' | 'set_bricks' | 'set_level' | 'boost' | 'upgrade' | 'reset' | 'restore'
export type Reward = { kind: RewardKind; amount: number; upgrade: string | null; data?: unknown }
// Set by an admin: the game shows a block screen (until = ISO end, null = permanent).
export type Ban = { until: string | null; reason: string }
export type ActivityEvent = { kind: 'building_started' | 'building_finished'; building: string; name: string; seconds?: number; at: number }

const ACTIVITY_KEY = 'rubble-activity'

function loadActivity(): ActivityEvent[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVITY_KEY)
    return raw ? (JSON.parse(raw) as ActivityEvent[]) : []
  } catch {
    return []
  }
}

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // storage unavailable — it may pop up again, that's all
  }
}

function storeActivity(events: ActivityEvent[]) {
  try {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(events))
  } catch {
    // storage unavailable — they still go up with this session's syncs
  }
}

export type Notice = { title: string; detail: string; message: string | null; emoji?: string; button?: string }

// Upgrades a code or gift can hand out for free, as players see them.
export const REWARD_UPGRADE_LABELS: Partial<Record<UpgradeKey, string>> = {
  workers: 'worker',
  fleet: 'truck',
  yardSize: 'yard expansion',
  yardDocks: 'unloading dock',
  tools: 'Better tools',
  speed: 'Walking speed',
  yardSpeed: 'Faster unloading',
  yardBonus: 'Better prices',
}

export type TruckUpgrade = 'load' | 'speed'
export const TRUCK_UPGRADE_INFO: Record<TruckUpgrade, { label: string; base: number; growth: number }> = {
  load: { label: 'Bigger truck', base: 35, growth: 1.5 },
  speed: { label: 'Faster truck', base: 40, growth: 1.5 },
}

export function truckUpgradeCost(key: TruckUpgrade, level: number): number {
  const info = TRUCK_UPGRADE_INFO[key]
  return Math.round(info.base * Math.pow(info.growth, level) * priceFactor())
}

export function upgradeCost(key: UpgradeKey, level: number): number {
  const info = UPGRADE_INFO[key]
  return Math.round(info.base * Math.pow(info.growth, level) * priceFactor())
}

// Level needed for the 2nd, 3rd and 4th unloading dock.
const DOCK_LEVELS = [5, 10, 15]

// Level needed for the yard's next size (from yardSize level n).
export function yardExpandLevel(n: number): number {
  return n < 4 ? [3, 6, 10, 15][n] : 15 + 5 * (n - 3)
}

// Why an upgrade can't be bought right now (besides the price), if so.
// `truckCapacity`: parking bays across all the player's yards (trucks need
// somewhere to park). For yard upgrades, `u` carries that yard's levels.
export function upgradeLock(key: UpgradeKey, u: Upgrades, level: number, truckCapacity?: number): string | null {
  if (key === 'fleet' && stats.truckCount(u) >= (truckCapacity ?? stats.yardCapacity(u))) return 'Yards full'
  if (key === 'yardDocks') {
    if (stats.docks(u) >= MAX_DOCKS) return 'Max docks'
    const need = DOCK_LEVELS[u.yardDocks]
    if (level < need) return `Lv ${need}`
  }
  if (key === 'yardSize') {
    if (stats.yardSize(u) >= (u.yardMax ?? YARD_MAX_SIZE)) return 'Max size'
    const need = yardExpandLevel(u.yardSize)
    if (level < need) return `Lv ${need}`
  }
  return null
}

// Station looks change at these levels (see stations.ts); the crew
// trailer's milestones also raise how many bricks a worker can carry.
export const MILESTONES = [5, 10, 25]
const milestonesReached = (level: number) => MILESTONES.filter((m) => level >= m).length

export const stats = {
  // BREAK is a fixed single brick per tap; tools make the workers faster.
  bricksPerTap: () => 1,
  // Bricks a worker carries per trip: +1 at each crew trailer milestone
  // (Tent 1 → Portacabin 2 → Site Office 3 → Site HQ 4).
  carry: (u: Upgrades) => 1 + milestonesReached(1 + u.workers + u.speed),
  // Pickup time: how long a worker spends working a brick loose (or
  // picking one up) before carrying it off. Starts slow; tools speed it up.
  pullSeconds: (u: Upgrades) => 3 / (1 + 0.15 * u.tools) / T('pickupSpeed'),
  walkSpeed: (u: Upgrades) => 2 * (1 + 0.15 * u.speed) * T('walkSpeed'),
  workerCount: (u: Upgrades) => 1 + u.workers,
  dumpsterCapacity: (level: number) => 8 + 6 * level,
  truckCount: (u: Upgrades) => 1 + u.fleet,
  // The Brick Yard's size sets how many trucks you can buy (2 bays a size).
  yardSize: (u: Upgrades) => Math.min(u.yardMax ?? YARD_MAX_SIZE, 1 + u.yardSize),
  yardCapacity: (u: Upgrades) => yardCapacity(Math.min(u.yardMax ?? YARD_MAX_SIZE, 1 + u.yardSize)),
  docks: (u: Upgrades) => Math.min(MAX_DOCKS, 1 + u.yardDocks),
  // Per truck, from that truck's own levels.
  truckCargo: (loadLevel: number) => Math.max(1, Math.round((8 + 6 * loadLevel) * T('truckLoad'))),
  truckSpeed: (speedLevel: number) => 6 * (1 + 0.12 * speedLevel) * T('truckSpeed'),
  unloadSeconds: (u: Upgrades) => Math.max(0.4, 2 * Math.pow(0.88, u.yardSpeed)) / T('unloadSpeed'),
  priceBonus: (u: Upgrades) => 0.05 * u.yardBonus,
}

export type WorkerState = 'idle' | 'toPick' | 'picking' | 'toDumpster' | 'waiting' | 'holding'

export type Worker = {
  id: number
  plot: number
  x: number
  z: number
  heading: number
  state: WorkerState
  tx: number
  tz: number
  target: { kind: 'brick'; index: number } | { kind: 'rubble'; id: number } | null
  timer: number
  // Colour of the top brick in their arms (null = empty-handed) and how
  // many they're holding.
  carrying: BrickColor | null
  held: number
  dumpster: number // which of the plot's dumpsters they're heading to / lined up at
  via: { x: number; z: number }[] // corners to walk past first (around the building)
}

export type Rubble = { id: number; x: number; z: number; color: BrickColor; claimed: boolean; readyAt: number }

// 'away' is kept for the plot snapshot: no truck at that plot right now.
export type TruckState = 'away' | 'driving' | 'loading' | 'unloading' | 'parked'

// The fleet drives the real roads in laps: each owned plot in order
// (skipping empty dumpsters), loading what's there; if it fills up mid-lap
// it unloads at the Brick Yard and carries on, and it always unloads at the
// end of a lap. Bricks are paid for when they're unloaded.
export type Truck = {
  id: number
  load: number // upgrade levels, per truck
  speed: number
  state: TruckState
  x: number
  z: number
  heading: number
  path: Point[]
  dest: { kind: 'plot'; plot: number } | { kind: 'yard' } | { kind: 'park' }
  at: RoadSpot // the plot stop it's at, when out on the road
  home: number // the island whose yard it parks at
  yard: number // the island whose yard it's in / heading to
  inYard: 'bay' | 'parked' | null // inside that yard's fence
  dock: number // the unloading dock it's heading to / using
  stuck: number // seconds spent waiting behind another truck
  squeeze: number // seconds left of squeezing past (after waiting too long)
  lap: number // next plot index to visit this lap
  timer: number
  cargo: number
  cargoValue: number
}

export type EngineEvent =
  | { type: 'siteStarted' }
  | { type: 'resync' }
  | { type: 'brickBroken'; index: number; toX: number; toZ: number }
  | { type: 'brickPulled'; index: number; workerId: number }
  | { type: 'rubbleSpawned'; id: number }
  | { type: 'rubblePicked'; id: number }

// empty: owned, waiting for you to pick a building. cleared: building's
// gone, waiting for you to tap and claim the completion bonus.
export type PlotPhase = 'empty' | 'demolishing' | 'cleared'

export type PlotSnap = {
  id: number
  phase: PlotPhase
  buildingId: string
  bricksTotal: number
  bricksLeft: number
  rubbleLeft: number
  dumpsterLoad: number // all of the plot's dumpsters together
  dumpsters: { level: number; load: number; capacity: number }[]
  truckState: TruckState
  crew: number
  crewTarget: number // where the crew split is heading (workers walk over)
}

export type TruckSnap = { id: number; load: number; speed: number; cargo: number; state: TruckState }

export type Snapshot = {
  scrap: number
  xp: number
  level: number
  upgrades: Upgrades
  plots: PlotSnap[]
  trucks: TruckSnap[]
  crewAuto: boolean
  crewMode: 'work' | 'even' | 'custom'
  incomePerMinute: number
  offlineEarnings: number
  sitesCleared: number
  bonusDrop: { amount: number; secondsLeft: number } | null
  // Seconds of crew boost left (0 = off).
  boostLeft: number
  notice: Notice | null
  // Replaying time away: progress 0–1, or null when not catching up.
  catchUp: number | null
  shortId: string | null
  username: string | null
  ban: Ban | null
  yardBuild: { yard: number; toSize: number; secondsLeft: number; totalSeconds: number } | null
  islands: { id: IslandId; open: boolean; yard: YardLevels }[]
  truckCapacity: number
  bridgeBuild: { to: IslandId; secondsLeft: number; totalSeconds: number } | null
  events: LiveEvent[]
  banners: Broadcast[]
  synced: boolean
}

type PlotSave = {
  phase: PlotPhase
  buildingId: string
  removed: string
  rubble: number
  // An admin-made building in progress keeps its own copy, so later edits
  // to (or deleting) the building never break the demolition.
  custom?: BuildingDef
  dumpsterLoad?: number // before each plot could have several dumpsters
  dumpsters?: { level: number; load: number }[]
  worked?: number // seconds spent demolishing this building so far
}

export type SaveData = {
  scrap: number
  xp: number
  upgrades: Upgrades
  plots: PlotSave[]
  trucks?: { load: number; speed: number; home?: number }[]
  crewPlan: number[] | null
  sitesCleared: number
  lastSeen: number
  yardBuild?: YardBuild | null
  yards?: YardLevels[]
  bridges?: IslandId[]
  bridgeBuild?: BridgeBuild | null
}

// A yard expansion under construction: real-world times (ms), so it keeps
// building while the game is closed. `level` is the yardSize it finishes at.
export type YardBuild = { yard: number; level: number; startedAt: number; endsAt: number }

// Each island's yard has its own upgrade levels.
export type YardLevels = { size: number; docks: number; speed: number; bonus: number }
export const YARD_KEYS = ['yardSize', 'yardDocks', 'yardSpeed', 'yardBonus'] as const
const YARD_FIELD: Record<(typeof YARD_KEYS)[number], keyof YardLevels> = { yardSize: 'size', yardDocks: 'docks', yardSpeed: 'speed', yardBonus: 'bonus' }
export const isYardKey = (k: UpgradeKey): k is (typeof YARD_KEYS)[number] => (YARD_KEYS as readonly string[]).includes(k)

// A bridge to the next island being built (real-world times, ms).
export type BridgeBuild = { to: IslandId; startedAt: number; endsAt: number }
export const BRIDGE_AD_SHARE = 0.25

// How long building the yard up to each size takes (sizes 2–10).
const YARD_BUILD_MINUTES = [5, 15, 30, 60, 120, 180, 240, 300, 360]
export function yardBuildSeconds(toSize: number): number {
  return YARD_BUILD_MINUTES[Math.max(0, Math.min(YARD_BUILD_MINUTES.length - 1, toSize - 2))] * 60
}
// Each ad takes this share of the full build time off.
export const YARD_AD_SHARE = 0.25

type LegacySave = {
  scrap: number
  xp: number
  upgrades: Partial<Upgrades> & { hammer?: number; truck?: number; dumpster?: number }
  buildingId: string
  phase: 'demolishing' | 'picking'
  removed: string
  rubble: number
  dumpsterLoad: number
  sitesCleared?: number
  lastSeen: number
}

function encodeBits(bits: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8))
  bits.forEach((b, i) => {
    if (b) bytes[i >> 3] |= 1 << (i & 7)
  })
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s)
}

function savedBrickBytes(encoded: string): number {
  try {
    return atob(encoded).length
  } catch {
    return -1
  }
}

function decodeBits(encoded: string, length: number): Uint8Array {
  const bits = new Uint8Array(length)
  try {
    const s = atob(encoded)
    // Saved for a different number of bricks (the building was redesigned):
    // start it fresh rather than knock random holes in the new one.
    if (s.length !== Math.ceil(length / 8)) return bits
    for (let i = 0; i < length; i++) bits[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1
  } catch {
    // corrupt save — start the site fresh
  }
  return bits
}

// One plot's demolition site: the building's bricks, rubble on the ground,
// the dumpster and this plot's truck run.
export class Site {
  phase: PlotPhase = 'empty'
  worked = 0 // seconds of demolishing (online + away) on this building
  building: BuildingDef = BUILDINGS[0]
  bricks: Brick[] = []
  removed: Uint8Array = new Uint8Array(0)
  claimed: Uint8Array = new Uint8Array(0)
  bricksLeft = 0
  // Each column (unique x,z) lists its brick indices bottom→top; bricks only
  // ever leave from the top, so a pointer per column tracks the current top.
  columns: number[][] = []
  columnTop = new Int32Array(0)
  columnAt = new Map<string, number>() // "x,z" (brick units) → column
  brickColumn = new Int32Array(0)
  halfX = 0
  halfZ = 0

  rubble: Rubble[] = []
  // Each dumpster's size level, how full it is, and the worker ids lined
  // up at it (front first; only the front one tips their bricks in).
  dumpsters: { level: number; load: number; queue: number[] }[] = [{ level: 0, load: 0, queue: [] }]
  private nextRubbleId = 1

  get dumpsterLoad() {
    return this.dumpsters.reduce((n, d) => n + d.load, 0)
  }
  // Drained by this plot's Building renderer.
  events: EngineEvent[] = []

  constructor(readonly id: number) {}

  loadBuilding(def: BuildingDef, removed?: Uint8Array) {
    this.building = def
    this.bricks = bricksFor(def)
    this.removed = removed ?? new Uint8Array(this.bricks.length)
    this.claimed = new Uint8Array(this.bricks.length)
    const [w, , d] = sizeFor(def)
    this.halfX = (w * BRICK) / 2
    this.halfZ = (d * BRICK) / 2

    const byKey = new Map<string, number[]>()
    this.bricks.forEach((b, i) => {
      const key = `${b.x},${b.z}`
      const list = byKey.get(key)
      if (list) list.push(i)
      else byKey.set(key, [i])
    })
    this.columns = [...byKey.values()].map((list) => list.sort((a, b) => this.bricks[a].y - this.bricks[b].y))
    this.columnAt = new Map([...byKey.keys()].map((k, c) => [k, c]))
    this.columnTop = new Int32Array(this.columns.length)
    this.brickColumn = new Int32Array(this.bricks.length)
    this.columns.forEach((list, c) => {
      for (const i of list) this.brickColumn[i] = c
      let top = list.length - 1
      while (top >= 0 && this.removed[list[top]]) top--
      this.columnTop[c] = top
    })
    this.bricksLeft = this.bricks.length - this.removed.reduce((n, r) => n + r, 0)
    this.events.push({ type: 'siteStarted' })
  }

  // Empty plots draw nothing; keep the last building's data but no bricks.
  clearBricks() {
    this.bricks = []
    this.removed = new Uint8Array(0)
    this.claimed = new Uint8Array(0)
    this.columns = []
    this.columnTop = new Int32Array(0)
    this.columnAt = new Map()
    this.brickColumn = new Int32Array(0)
    this.bricksLeft = 0
    this.events.push({ type: 'siteStarted' })
  }

  brickWorld(i: number) {
    const b = this.bricks[i]
    return { x: b.x * BRICK, y: b.y * BRICK + BRICK / 2, z: b.z * BRICK }
  }

  removeBrick(i: number) {
    this.removed[i] = 1
    this.claimed[i] = 0
    this.bricksLeft--
    const c = this.brickColumn[i]
    let t = this.columnTop[c]
    while (t >= 0 && this.removed[this.columns[c][t]]) t--
    this.columnTop[c] = t
  }

  // The best unclaimed top-of-column brick: nearest to `near` (a worker's
  // preferred spot) if given, otherwise the highest one (taps take the roof
  // off first, which reads as demolition rather than random damage).
  pickTopBrick(near: { x: number; z: number } | null): number {
    let best = -1
    let bestScore = Infinity
    for (let c = 0; c < this.columns.length; c++) {
      const top = this.columnTop[c]
      if (top < 0) continue
      const i = this.columns[c][top]
      if (this.claimed[i]) continue
      const b = this.bricks[i]
      // Workers peel the building from the outside in (close to where
      // they stand), starting near their own side of it.
      const depth = Math.min(this.halfX - Math.abs(b.x * BRICK), this.halfZ - Math.abs(b.z * BRICK))
      const score = near
        ? (b.x * BRICK - near.x) ** 2 + (b.z * BRICK - near.z) ** 2 + depth * 8 - b.y * BRICK * 0.15
        : -b.y + Math.random() * 0.9
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    return best
  }

  spawnRubble(color: BrickColor, readyAt: number, from?: { x: number; z: number }) {
    const angle = from ? Math.atan2(from.z, from.x) + (Math.random() - 0.5) * 0.8 : Math.random() * Math.PI * 2
    const reach = Math.max(this.halfX, this.halfZ) + 0.4 + Math.random() * 1.6
    const limit = LOT_HALF - 0.6
    const x = Math.max(-limit, Math.min(limit, Math.cos(angle) * reach))
    const z = Math.max(-limit, Math.min(DUMPSTER.z - 1.2, Math.sin(angle) * reach))
    const r: Rubble = { id: this.nextRubbleId++, x, z, color, claimed: false, readyAt }
    this.rubble.push(r)
    return r
  }

  // A spot in a dumpster's line: front first, along the slot's direction,
  // wrapping into a second row (see DUMPSTER_SLOTS).
  queueSpot(dumpster: number, i: number) {
    // One tidy straight line (at most MAX_LINE long; the rest wait aside).
    const slot = DUMPSTER_SLOTS[dumpster]
    const k = Math.min(i, MAX_LINE - 1)
    return { x: slot.line.x + slot.dir.x * k, z: slot.line.z + slot.dir.z * k }
  }

  // Where workers wait with their bricks while a dumpster is full or its
  // line is long: a loose group on the far side of the dumpster.
  holdSpot(dumpster: number, i: number) {
    const slot = DUMPSTER_SLOTS[dumpster]
    const len = Math.hypot(slot.dir.x, slot.dir.z) || 1
    const ux = slot.dir.x / len
    const uz = slot.dir.z / len
    // A 5×4 group; any more stand a little off-grid so they don't stack.
    const k = i % 20
    const col = k % 5
    const row = Math.floor(k / 5)
    const jitter = i >= 20 ? 0.25 * (1 + Math.floor(i / 20)) : 0
    const x = slot.x - ux * (1.9 + col * 0.5 + jitter) + slot.wrap.x * (row * 0.6 + jitter)
    const z = slot.z - uz * (1.9 + col * 0.5 + jitter) + slot.wrap.z * (row * 0.6 + jitter)
    const lim = LOT_HALF - 0.4
    return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) }
  }

  // Corners to walk past so a straight line between two spots doesn't cut
  // through the building's footprint.
  detour(fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
    if (!this.bricksLeft) return []
    const hx = this.halfX + 0.25
    const hz = this.halfZ + 0.25
    const crosses = (ax: number, az: number, bx: number, bz: number) => {
      // Segment vs. rectangle (slab test).
      let t0 = 0
      let t1 = 1
      const dx = bx - ax
      const dz = bz - az
      for (const [p, d, lo, hi] of [[ax, dx, -hx, hx], [az, dz, -hz, hz]]) {
        if (Math.abs(d) < 1e-9) {
          if (p <= lo || p >= hi) return false
        } else {
          let a = (lo - p) / d
          let b = (hi - p) / d
          if (a > b) [a, b] = [b, a]
          t0 = Math.max(t0, a)
          t1 = Math.min(t1, b)
          if (t0 >= t1) return false
        }
      }
      return t1 - t0 > 0.02
    }
    if (!crosses(fx, fz, tx, tz)) return []
    const cx = this.halfX + 0.55
    const cz = this.halfZ + 0.55
    const corners = [
      { x: cx, z: cz },
      { x: -cx, z: cz },
      { x: -cx, z: -cz },
      { x: cx, z: -cz },
    ]
    const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)
    const from = { x: fx, z: fz }
    const to = { x: tx, z: tz }
    let best: { x: number; z: number }[] = []
    let bestLen = Infinity
    for (let i = 0; i < 4; i++) {
      const c = corners[i]
      if (!crosses(fx, fz, c.x, c.z) && !crosses(c.x, c.z, tx, tz)) {
        const len = d(from, c) + d(c, to)
        if (len < bestLen) {
          bestLen = len
          best = [c]
        }
      }
      for (const j of [(i + 1) % 4, (i + 3) % 4]) {
        const c2 = corners[j]
        if (!crosses(fx, fz, c.x, c.z) && !crosses(c2.x, c2.z, tx, tz)) {
          const len = d(from, c) + d(c, c2) + d(c2, to)
          if (len < bestLen) {
            bestLen = len
            best = [c, c2]
          }
        }
      }
    }
    return best
  }

  // Shortest line wins; ties go to the dumpster with the most room.
  pickDumpster(capacityOf: (level: number) => number, walkingTo: number[]): number {
    let best = 0
    let bestScore = Infinity
    this.dumpsters.forEach((d, i) => {
      const score = (d.queue.length + walkingTo[i]) * 1000 - (capacityOf(d.level) - d.load)
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    })
    return best
  }

  // A preferred spot around the building for each worker (golden-angle
  // spread) so the crew fans out instead of all queueing at one wall.
  homeSpot(slot: number, crew: number) {
    // Evenly round the building by the worker's place in this plot's crew.
    const a = (slot / Math.max(1, crew)) * Math.PI * 2 + this.id * 0.7
    return { x: Math.cos(a) * (this.halfX + 2), z: Math.sin(a) * (this.halfZ + 2) }
  }

  // Where a worker stands to pull a given brick: just outside the footprint
  // on the side nearest that brick.
  // Steps out from the brick (in brick units) toward the nearest outside
  // edge until reaching ground that's already cleared or outside the
  // footprint — so they stand right next to what they're pulling, never
  // inside the walls.
  standSpot(i: number) {
    const b = this.bricks[i]
    const nx = (b.x * BRICK) / Math.max(this.halfX, 0.01)
    const nz = (b.z * BRICK) / Math.max(this.halfZ, 0.01)
    const alongX = Math.abs(nx) > Math.abs(nz)
    const dir = Math.sign(alongX ? b.x : b.z) || 1
    for (let s = 1; s < 80; s++) {
      const px = alongX ? b.x + dir * s : b.x
      const pz = alongX ? b.z : b.z + dir * s
      const c = this.columnAt.get(`${px},${pz}`)
      if (c === undefined || this.columnTop[c] < 0) {
        // Half a brick short of the empty cell's centre: close, not inside.
        const back = s === 1 ? 0.1 : 0.35
        return { x: (alongX ? px - dir * back : px) * BRICK, z: (alongX ? pz : pz - dir * back) * BRICK }
      }
    }
    return { x: alongX ? dir * (this.halfX + 0.45) : b.x * BRICK, z: alongX ? b.z * BRICK : dir * (this.halfZ + 0.45) }
  }
}

export class Engine {
  time = 0
  scrap = 0
  xp = 0
  upgrades: Upgrades = { tools: 0, speed: 0, workers: 0, fleet: 0, yardSize: 0, yardDocks: 0, yardSpeed: 0, yardBonus: 0 }
  sitesCleared = 0
  offlineEarnings = 0

  // Owned plots, in unlock order (plots[i] sits on PLOT_SLOTS[i]).
  plots: Site[] = []
  workers: Worker[] = []
  trucks: Truck[] = []
  // Manual crew split per plot, or null to split evenly (see desiredCrew).
  crewPlan: number[] | null = null
  private recentHauls: { t: number; value: number }[] = []

  private listeners = new Set<() => void>()
  private dirty = true
  private lastFlush = 0
  private snapshot: Snapshot | null = null

  get home(): Site {
    return this.plots[0]
  }

  // ── Setup ─────────────────────────────────────────────────────────────

  // The truck loading at (or heading for) a plot, if any.
  truckAt(site: Site): Truck | null {
    return this.trucks.find((t) => t.dest.kind === 'plot' && t.dest.plot === site.id && t.state !== 'parked') ?? null
  }

  private loadingAt(site: Site) {
    return this.trucks.some((t) => t.state === 'loading' && t.dest.kind === 'plot' && t.dest.plot === site.id)
  }

  // ── Islands and yards ─────────────────────────────────────────────────

  yardLevels: YardLevels[] = ISLANDS.map(() => ({ size: 0, docks: 0, speed: 0, bonus: 0 }))
  bridges: IslandId[] = []
  bridgeBuild: BridgeBuild | null = null

  islandOpen(id: IslandId) {
    return ISLANDS.find((s) => s.id === id)?.unlock === null || this.bridges.includes(id)
  }

  openYards(): number[] {
    return ISLANDS.filter((s) => this.islandOpen(s.id)).map((s) => s.index)
  }

  // The upgrades as seen from one yard (its own yard levels).
  yardU(y: number): Upgrades {
    const l = this.yardLevels[y] ?? { size: 0, docks: 0, speed: 0, bonus: 0 }
    return { ...this.upgrades, yardSize: l.size, yardDocks: l.docks, yardSpeed: l.speed, yardBonus: l.bonus, yardMax: ISLANDS[y]?.yard.maxSize }
  }

  // Parking bays across every open yard.
  truckCapacity() {
    return this.openYards().reduce((n, y) => n + stats.yardCapacity(this.yardU(y)), 0)
  }

  // A truck's bay number at its home yard (by order among that yard's trucks).
  private parkRank(truck: { id: number; home: number }) {
    return this.trucks.filter((t) => t.home === truck.home && t.id < truck.id).length
  }

  // A truck its home yard has no bay for parks at the kerb out front.
  private kerbIndex(truck: { id: number; home: number }): number | null {
    const cap = stats.yardCapacity(this.yardU(truck.home))
    const rank = this.parkRank(truck)
    return rank >= cap ? rank - cap : null
  }

  // Where a new truck lives: the first open yard with a free bay.
  private homeForNewTruck(): number {
    const open = this.openYards()
    for (const y of open) if (this.trucks.filter((t) => t.home === y).length < stats.yardCapacity(this.yardU(y))) return y
    return open[open.length - 1] ?? 0
  }

  // The yard to unload at: the one on the island the truck is on (if it's
  // open), else its home yard.
  private unloadYard(truck: Truck): number {
    const here = islandAt(truck.x, truck.z)
    return here && this.islandOpen(here.id) ? here.index : truck.home
  }

  private newTruck(id: number, levels?: { load: number; speed: number; home?: number }): Truck {
    const home = levels?.home ?? this.homeForNewTruck()
    const kerb = this.kerbIndex({ id, home })
    const road = kerb === null ? null : kerbSpot(home, kerb)
    const spot = road ? { x: road.x, z: road.line - KERB_INSET } : parkingSpot(home, this.parkRank({ id, home }))
    return {
      id,
      load: levels?.load ?? 0,
      speed: levels?.speed ?? 0,
      state: 'parked',
      x: spot.x,
      z: spot.z,
      heading: road ? Math.PI / 2 : 0,
      path: [],
      dest: { kind: 'park' },
      at: road ?? yardGateOut(home),
      home,
      yard: home,
      inYard: road ? null : 'parked',
      dock: 0,
      stuck: 0,
      squeeze: 0,
      lap: 0,
      timer: 0,
      cargo: 0,
      cargoValue: 0,
    }
  }

  private syncWorkers() {
    while (this.trucks.length < stats.truckCount(this.upgrades)) this.trucks.push(this.newTruck(this.trucks.length))
    const want = stats.workerCount(this.upgrades)
    const start = this.plots.find((p) => p.phase === 'demolishing') ?? this.home
    while (this.workers.length < want) {
      const id = this.workers.length
      this.workers.push(this.newWorker(id, start.id))
    }
  }

  // After an admin takes workers or trucks away: drop the extras. A worker's
  // claimed brick goes back up for grabs and it leaves any dumpster line.
  private trimCrew() {
    const wantTrucks = stats.truckCount(this.upgrades)
    if (this.trucks.length > wantTrucks) this.trucks = this.trucks.slice(0, wantTrucks)
    const want = stats.workerCount(this.upgrades)
    if (this.workers.length <= want) return
    for (const w of this.workers.slice(want)) this.releaseTarget(w)
    this.workers = this.workers.slice(0, want)
    for (const site of this.plots) for (const d of site.dumpsters) d.queue = d.queue.filter((id) => id < want)
  }

  private newWorker(id: number, plot: number): Worker {
    return {
      id,
      plot,
      x: DUMPSTER.x + (id % 5) * 0.5 - 1,
      z: DUMPSTER.z - 0.6,
      heading: Math.PI,
      state: 'idle',
      tx: 0,
      tz: 0,
      target: null,
      timer: 0,
      carrying: null,
      held: 0,
      dumpster: 0,
      via: [],
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────

  load() {
    loadTuning()
    try {
    } catch {
      // unreadable — the next sync says
    }
    this.loadSave()
    try {
      const resetMessage = localStorage.getItem(RESET_NOTICE_KEY)
      if (resetMessage !== null) {
        localStorage.removeItem(RESET_NOTICE_KEY)
        this.notices.push({ title: 'Fresh start', detail: 'Your progress was reset', message: resetMessage || null })
      }
      if (localStorage.getItem(RESTORE_NOTICE_KEY) !== null) {
        localStorage.removeItem(RESTORE_NOTICE_KEY)
        this.notices.push({ title: 'Progress restored', detail: 'Support put your game back to an earlier save', message: null })
      }
      const ban = localStorage.getItem(BAN_KEY)
      if (ban) this.setBan(JSON.parse(ban) as Ban)
      const pending = localStorage.getItem(PENDING_GRANTS_KEY)
      if (pending) {
        localStorage.removeItem(PENDING_GRANTS_KEY)
        for (const g of JSON.parse(pending) as (Reward & { message: string | null; source: string })[]) {
          this.applyReward(g, g.message, g.source)
        }
      }
    } catch {
      // nothing pending
    }
  }

  // A read-only copy of someone's game from their cloud save (the admin's
  // "watch" view): it runs, but never saves or logs anything.
  static viewer(save: SaveData): Engine {
    const e = new Engine()
    e.frozen = true
    e.loadSave(save)
    return e
  }

  private loadSave(given?: SaveData) {
    let save: SaveData | null = given ?? null
    if (!given) {
      try {
        const raw = localStorage.getItem(SAVE_KEY)
        if (raw) save = JSON.parse(raw) as SaveData
        else {
          const legacy = localStorage.getItem(LEGACY_SAVE_KEY)
          if (legacy) save = migrateLegacy(JSON.parse(legacy) as LegacySave)
        }
      } catch {
        save = null
      }
    }

    if (!save || !save.plots?.length) {
      const home = new Site(0)
      home.phase = 'demolishing'
      home.loadBuilding(BUILDINGS[0])
      this.plots = [home]
      this.syncWorkers()
      return
    }

    this.scrap = save.scrap
    this.xp = save.xp
    // Before per-truck levels, there was one shared "truck" upgrade: it
    // becomes the first truck's load level.
    // Likewise the one shared "dumpster" upgrade becomes each plot's first
    // dumpster's level.
    const {
      truck: oldTruckLevel,
      dumpster: oldDumpsterLevel,
      ...upgrades
    } = save.upgrades as Upgrades & { truck?: number; dumpster?: number }
    this.upgrades = { ...this.upgrades, ...upgrades }
    this.sitesCleared = save.sitesCleared ?? 0
    this.yardBuild = save.yardBuild && typeof save.yardBuild.yard === 'number' ? save.yardBuild : null
    this.bridges = save.bridges ?? []
    this.bridgeBuild = save.bridgeBuild ?? null
    if (save.yards) this.yardLevels = ISLANDS.map((_, i) => ({ ...{ size: 0, docks: 0, speed: 0, bonus: 0 }, ...(save.yards![i] ?? {}) }))
    if (this.yardBuild || this.bridgeBuild) {
      this.checkYardBuild()
      this.checkBridgeBuild()
    }
    this.crewPlan = save.crewPlan ?? null
    this.trucks = (save.trucks ?? [{ load: oldTruckLevel ?? 0, speed: 0 }]).map((t, id) => this.newTruck(id, t))
    this.plots = save.plots.slice(0, PLOT_SLOTS.length).map((ps, id) => {
      const site = new Site(id)
      site.phase = ps.phase
      site.worked = ps.worked ?? 0
      site.dumpsters = (ps.dumpsters ?? [{ level: oldDumpsterLevel ?? 0, load: ps.dumpsterLoad ?? 0 }])
        .slice(0, MAX_DUMPSTERS)
        .map((d) => ({ level: d.level, load: d.load, queue: [] }))
      if (ps.custom) registerCustomBuildings([ps.custom], false)
      let def = ps.custom ?? getBuilding(ps.buildingId)
      // Started before this building was redesigned: finish the old one.
      const old = ps.phase !== 'empty' && !ps.custom ? legacyOf(def.id) : null
      if (old && savedBrickBytes(ps.removed) === Math.ceil(brickCount(old) / 8) && savedBrickBytes(ps.removed) !== Math.ceil(brickCount(def) / 8)) def = old
      if (ps.phase === 'empty') {
        site.building = def
      } else {
        site.loadBuilding(def, decodeBits(ps.removed, brickCount(def)))
        for (let i = 0; i < ps.rubble; i++) site.spawnRubble(site.bricks[0]?.color ?? 'brick', 0)
      }
      return site
    })
    this.syncWorkers()
    if (!given) this.moveBigToHarbour()

    if (!given) this.beginCatchUp((Date.now() - save.lastSeen) / 1000)
  }

  // Once a reset starts, nothing may write the old progress back.
  private frozen = false

  save() {
    if (this.frozen) return
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.saveData()))
    } catch {
      // storage full / private mode — the game still runs, just won't persist
    }
  }

  // The save as plain data: written to localStorage and synced to the
  // player's cloud record.
  saveData(): SaveData {
    return {
      scrap: this.scrap,
      xp: this.xp,
      upgrades: this.upgrades,
      crewPlan: this.crewPlan,
      sitesCleared: this.sitesCleared,
      lastSeen: Date.now(),
      yardBuild: this.yardBuild,
      yards: this.yardLevels,
      bridges: this.bridges,
      bridgeBuild: this.bridgeBuild,
      trucks: this.trucks.map((t) => ({ load: t.load, speed: t.speed, home: t.home })),
      plots: this.plots.map((p) => ({
        phase: p.phase,
        buildingId: p.building.id,
        removed: encodeBits(p.removed),
        // Carried bricks go back on the ground on reload rather than vanishing.
        rubble: p.rubble.length + this.workers.reduce((n, w) => n + (w.plot === p.id ? w.held : 0), 0),
        dumpsters: p.dumpsters.map((d) => ({ level: d.level, load: d.load })),
        ...(p.building.shape && p.phase !== 'empty' ? { custom: p.building } : {}),
        ...(p.phase !== 'empty' ? { worked: Math.round(p.worked) } : {}),
      })),
    }
  }

  // ── Gifts & codes ─────────────────────────────────────────────────────

  // Shown one at a time by the HUD (see Snapshot.notice).
  notices: Notice[] = []
  // The player's public id and username from the cloud (null until the
  // first sync / until they pick a name).
  shortId: string | null = null
  username: string | null = null

  // Applies a reward from an admin gift, a balance edit or a redeem code,
  // and queues a notice telling the player what they got.
  applyReward(r: Reward, message: string | null, source: string) {
    if (r.kind === 'reset') {
      // Wipe the save and start over (keeping the player id and username).
      this.frozen = true
      try {
        localStorage.removeItem(SAVE_KEY)
        localStorage.removeItem(LEGACY_SAVE_KEY)
        localStorage.setItem(RESET_NOTICE_KEY, message ?? '')
      } catch {
        // storage unavailable — nothing saved to wipe
      }
      window.location.reload()
      return
    }
    if (r.kind === 'restore') {
      // Swap in a backed-up save (an admin undoing a mistake).
      if (!r.data || typeof r.data !== 'object') return
      this.frozen = true
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ ...(r.data as SaveData), lastSeen: Date.now() }))
        localStorage.setItem(RESTORE_NOTICE_KEY, '1')
      } catch {
        // storage unavailable — can't restore on this device
      }
      window.location.reload()
      return
    }
    // Admins can send negative amounts to take things away.
    const raw = Number(r.amount) || 0
    const amount = r.kind === 'set_bricks' || r.kind === 'set_level' ? Math.max(0, raw) : raw
    const taken = amount < 0
    let what = ''
    switch (r.kind) {
      case 'bricks':
        this.scrap = Math.max(0, this.scrap + amount)
        what = `${taken ? '−' : '+'}🧱${Math.round(Math.abs(amount)).toLocaleString()} bricks`
        break
      case 'set_bricks':
        this.scrap = amount
        what = `Your bricks were set to 🧱${Math.round(amount).toLocaleString()}`
        break
      case 'set_level': {
        // Start of that level (XP is total bricks hauled).
        const lv = Math.max(1, Math.round(amount))
        this.xp = xpForLevel(lv)
        what = `Your level was set to ${lv}`
        break
      }
      case 'boost':
        // Minutes of crew boost, on top of any boost already running.
        if (taken) this.boostUntil = Math.max(this.time, this.boostUntil + amount * 60)
        else this.boostUntil = Math.max(this.boostUntil, this.time) + amount * 60
        what = taken ? `⚡ ${-amount} min of crew boost removed` : `⚡ ${amount} min crew boost`
        break
      case 'upgrade': {
        const key = r.upgrade as UpgradeKey | null
        if (!key || !(key in this.upgrades)) return
        const n = Math.round(amount)
        const label = REWARD_UPGRADE_LABELS[key] ?? UPGRADE_INFO[key].label
        if (isYardKey(key)) {
          // Yard upgrades go to the newest island's yard.
          const y = this.openYards().at(-1) ?? 0
          const f = YARD_FIELD[key]
          this.yardLevels[y][f] = Math.max(0, this.yardLevels[y][f] + n)
        } else this.upgrades = { ...this.upgrades, [key]: Math.max(0, this.upgrades[key] + n) }
        this.syncWorkers()
        this.trimCrew()
        what = taken ? `${-n} ${label}${n < -1 ? ' upgrades' : ''} removed` : `${n} free ${label}${n > 1 ? ' upgrades' : ''}`
        break
      }
      default:
        return
    }
    const title = taken ? 'Your account was updated' : source === 'code' ? 'Code redeemed!' : 'You got a gift!'
    this.notices.push({ title, detail: what, message })
    this.save()
    this.markDirty()
  }

  // True once the cloud has answered at least once (so the HUD knows
  // whether "no username" really means none, for the first-play prompt).
  synced = false

  markSynced() {
    if (this.synced) return
    this.synced = true
    this.markDirty()
  }

  // A ban from the cloud (or null once lifted). Remembered on the device so
  // the block screen shows even before the next sync.
  ban: Ban | null = null

  setBan(ban: Ban | null) {
    // A temporary ban that has run out is no ban.
    const live = ban && (ban.until === null || new Date(ban.until).getTime() > Date.now()) ? ban : null
    if (JSON.stringify(live) === JSON.stringify(this.ban)) return
    this.ban = live
    try {
      if (live) localStorage.setItem(BAN_KEY, JSON.stringify(live))
      else localStorage.removeItem(BAN_KEY)
    } catch {
      // fine — it comes back on the next sync
    }
    this.markDirty()
  }

  setUsername(name: string | null) {
    if (name === this.username) return
    this.username = name
    this.markDirty()
  }

  setShortId(id: string | null) {
    if (id === this.shortId) return
    this.shortId = id
    this.markDirty()
  }

  dismissNotice() {
    this.notices.shift()
    this.markDirty()
  }

  // Events and messages from the last sync. New ones pop up once (events
  // when they start; popup-style messages); banner messages show until
  // they end or the player closes them.
  banners: Broadcast[] = []

  setLive(events: LiveEvent[], broadcasts: Broadcast[]) {
    liveEvents = events
    const seen = new Set(readList(SEEN_LIVE_KEY))
    const now = Date.now()
    for (const e of events) {
      if (seen.has(e.id) || new Date(e.startsAt).getTime() > now) continue
      seen.add(e.id)
      const info = eventInfo(e.kind)
      this.notices.push({ title: eventTitle(e.kind, e.value), detail: eventDetail(e.kind, e.value), message: null, emoji: info.emoji, button: "Let's go!" })
    }
    for (const b of broadcasts) {
      if (b.style !== 'popup' || seen.has(b.id)) continue
      seen.add(b.id)
      this.notices.push({ title: b.title, detail: b.body ?? '', message: null, emoji: '📣', button: 'OK' })
    }
    writeList(SEEN_LIVE_KEY, [...seen].slice(-200))
    const dismissed = new Set(readList(DISMISSED_KEY))
    this.banners = broadcasts.filter((b) => b.style === 'banner' && !dismissed.has(b.id))
    this.markDirty()
  }

  dismissBanner(id: string) {
    writeList(DISMISSED_KEY, [...readList(DISMISSED_KEY), id].slice(-200))
    this.banners = this.banners.filter((b) => b.id !== id)
    this.markDirty()
  }

  // What the player's cloud record shows in the admin.
  cloudSummary() {
    return {
      scrap: this.scrap,
      xp: this.xp,
      level: levelForXp(this.xp),
      plots: this.plots.length,
      workers: this.workers.length,
      sitesCleared: this.sitesCleared,
    }
  }

  // Building starts and finishes waiting to go up with the next cloud sync
  // (the admin activity log and building stats). Kept in storage so a
  // closed tab doesn't lose them.
  private activity: ActivityEvent[] = loadActivity()

  private logActivity(e: Omit<ActivityEvent, 'at'>) {
    if (this.frozen) return // a viewer copy, or mid-reset
    this.activity = [...this.activity, { ...e, at: Date.now() }].slice(-200)
    storeActivity(this.activity)
  }

  takeActivity(): ActivityEvent[] {
    const out = this.activity
    this.activity = []
    storeActivity(this.activity)
    return out
  }

  // A sync failed: put them back in front of anything logged since.
  returnActivity(events: ActivityEvent[]) {
    this.activity = [...events, ...this.activity].slice(-200)
    storeActivity(this.activity)
  }

  // ── Time away ─────────────────────────────────────────────────────────
  //
  // Time spent away (app closed or in the background) is replayed with the
  // real simulation, a slice at a time so the screen never freezes (see
  // useEngine), so you come back to exactly what would have happened. If a
  // huge stretch would take too long to replay, the rest is filled in at
  // the pace actually measured during the replay.

  private catchUpLeft = 0
  private catchUpTotal = 0
  private catchUpStartScrap = 0
  private catchUpSpentMs = 0
  private catchUpReplayed = 0
  private catchUpStartBricks: number[] = []
  private replaying = false

  beginCatchUp(seconds: number) {
    // Banned time doesn't count as time away.
    if (this.ban) return
    const away = Math.min(MAX_OFFLINE_SECONDS * T('offlineTime'), Math.max(0, seconds))
    if (away < 5) return
    if (this.catchUpLeft > 0) {
      this.catchUpLeft += away
      this.catchUpTotal += away
      return
    }
    this.catchUpLeft = away
    this.catchUpTotal = away
    this.catchUpStartScrap = this.scrap
    this.catchUpSpentMs = 0
    this.catchUpReplayed = 0
    this.catchUpStartBricks = this.plots.map((p) => p.bricksLeft)
    this.markDirty()
  }

  catchingUp() {
    return this.catchUpLeft > 0
  }

  // Replays up to `budgetMs` of computing; true once all time away is done.
  stepCatchUp(budgetMs: number): boolean {
    if (this.catchUpLeft <= 0) return true
    const start = performance.now()
    this.replaying = true
    try {
      while (this.catchUpLeft > 0 && performance.now() - start < budgetMs) {
        for (let i = 0; i < 50 && this.catchUpLeft > 0; i++) {
          const dt = Math.min(0.1, this.catchUpLeft)
          simClockOffsetMs = this.catchUpLeft * 1000
          this.tick(dt)
          this.catchUpLeft -= dt
          this.catchUpReplayed += dt
        }
      }
    } finally {
      this.replaying = false
      simClockOffsetMs = 0
    }
    // Skip the flying-brick effects for replayed time.
    for (const site of this.plots) site.events.length = 0
    this.catchUpSpentMs += performance.now() - start
    if (this.catchUpLeft > 0 && this.catchUpSpentMs > MAX_REPLAY_MS) this.estimateRest()
    if (this.catchUpLeft <= 0) this.finishCatchUp()
    this.markDirty()
    return this.catchUpLeft <= 0
  }

  // The rest of a very long absence, at each plot's measured replay pace.
  private estimateRest() {
    const seconds = this.catchUpLeft
    // Pay at the middle of the estimated stretch for any events.
    simClockOffsetMs = (seconds / 2) * 1000
    const u = this.upgrades
    this.plots.forEach((site, i) => {
      if (site.phase !== 'demolishing' || this.catchUpReplayed <= 0) return
      const pace = Math.max(0, (this.catchUpStartBricks[i] ?? site.bricksLeft) - site.bricksLeft) / this.catchUpReplayed
      const available = site.bricksLeft + site.rubble.length + site.dumpsterLoad
      let hauled = Math.min(Math.floor(pace * seconds), available)
      const total = hauled
      site.worked += pace > 0 ? Math.min(seconds, total / pace) : seconds
      if (total <= 0) return
      for (const d of site.dumpsters) {
        const take = Math.min(hauled, d.load)
        d.load -= take
        hauled -= take
      }
      const fromRubble = Math.min(hauled, site.rubble.length)
      site.rubble.splice(0, fromRubble)
      hauled -= fromRubble
      while (hauled > 0) {
        const b = site.pickTopBrick(null)
        if (b < 0) break
        site.removeBrick(b)
        hauled--
      }
      this.pay(total, total * site.building.brickValue * (1 + stats.priceBonus(u)))
      this.checkCleared(site)
    })
    this.time += seconds
    this.catchUpLeft = 0
    simClockOffsetMs = 0
  }

  private finishCatchUp() {
    this.offlineEarnings += Math.max(0, Math.round(this.scrap - this.catchUpStartScrap))
    this.catchUpTotal = 0
    for (const site of this.plots) site.events.push({ type: 'resync' })
    this.save()
  }

  // The game loop's tick: paused while time away is being replayed.
  frameTick(dt: number) {
    // Nothing happens while time away is replayed, or while banned.
    if (this.catchUpLeft > 0 || this.ban) return
    this.tick(dt)
  }


  // ── Player actions ────────────────────────────────────────────────────

  boostUntil = -Infinity
  private lastBoostSecond = -1

  boostActive() {
    return this.time < this.boostUntil
  }

  private boostMul() {
    return (this.boostActive() ? 1 + (BOOST_FACTOR - 1) * T('boostPower') : 1) * eventMultiplier('crew_boost')
  }

  boost() {
    // Tops up to at least a few seconds; never shortens a longer boost
    // (e.g. minutes from a gift or code).
    this.boostUntil = Math.max(this.boostUntil, this.time + BOOST_SECONDS)
    this.markDirty()
  }


  private breakBrick(site: Site, i: number) {
    const pos = site.brickWorld(i)
    site.removeBrick(i)
    const r = site.spawnRubble(site.bricks[i].color, this.time + BREAK_FALL_SECONDS, pos)
    site.events.push({ type: 'brickBroken', index: i, toX: r.x, toZ: r.z })
    site.events.push({ type: 'rubbleSpawned', id: r.id })
    this.markDirty()
  }

  // The BREAK button: one brick off the top of the building. No cooldown.
  breakTap(plot: number) {
    const site = this.plots[plot]
    if (!site || site.phase !== 'demolishing') return 0
    let broke = 0
    for (let n = 0; n < stats.bricksPerTap(); n++) {
      const i = site.pickTopBrick(null)
      if (i < 0) break
      this.breakBrick(site, i)
      broke++
    }
    return broke
  }

  // Tapping the building: knock out the brick where you tapped. Bricks only
  // leave from the top of their column (nothing ever floats), so it's the
  // top of the tapped column — tap the same spot to carve down. If a worker
  // already has that one, the nearest free top brick goes instead.
  breakBrickAt(plot: number, index: number) {
    const site = this.plots[plot]
    if (!site || site.phase !== 'demolishing' || !site.bricks[index]) return 0
    const c = site.brickColumn[index]
    let i = site.columnTop[c] >= 0 ? site.columns[c][site.columnTop[c]] : -1
    if (i < 0 || site.claimed[i]) {
      const p = site.brickWorld(index)
      i = site.pickTopBrick({ x: p.x, z: p.z })
    }
    if (i < 0) return 0
    this.breakBrick(site, i)
    return 1
  }

  // ── Yard expansion (built over time) ─────────────────────────────────

  yardBuild: YardBuild | null = null

  // Finishes the expansion once its time is up (called every tick, and
  // after loading so time away counts).
  private checkYardBuild() {
    const b = this.yardBuild
    if (!b || Date.now() < b.endsAt) return
    this.yardBuild = null
    const l = this.yardLevels[b.yard]
    if (l && l.size < b.level) l.size = b.level
    const size = stats.yardSize(this.yardU(b.yard))
    if (!this.frozen)
      this.notices.push({ title: `${ISLANDS[b.yard].yard.name} expanded!`, detail: `Room for ${yardCapacity(size)} trucks there now`, message: null, emoji: '🏗️', button: 'Nice!' })
    this.save()
    this.markDirty()
  }

  // ── Bridges (to the next island) ──────────────────────────────────────

  // Why the bridge to an island can't be started now, if so.
  bridgeLock(to: IslandId): string | null {
    const s = ISLANDS.find((i) => i.id === to)
    if (!s?.unlock) return 'Already open'
    if (this.islandOpen(to)) return 'Already built'
    const prev = ISLANDS[s.index - 1]
    if (prev && !this.islandOpen(prev.id)) return `Open the ${prev.name} first`
    if (this.bridgeBuild) return 'A bridge is already being built'
    if (levelForXp(this.xp) < s.unlock.level) return `Lv ${s.unlock.level}`
    if (this.scrap < buildPrice(s.unlock.cost)) return 'Not enough bricks'
    return null
  }

  buildBridge(to: IslandId): string | null {
    const why = this.bridgeLock(to)
    if (why) return why
    const s = ISLANDS.find((i) => i.id === to)!
    this.scrap -= buildPrice(s.unlock!.cost)
    const now = Date.now()
    this.bridgeBuild = { to, startedAt: now, endsAt: now + s.unlock!.buildMinutes * 60_000 }
    this.save()
    this.markDirty()
    return null
  }

  private checkBridgeBuild() {
    const b = this.bridgeBuild
    if (!b || Date.now() < b.endsAt) return
    this.bridgeBuild = null
    if (!this.bridges.includes(b.to)) this.bridges = [...this.bridges, b.to]
    const s = ISLANDS.find((i) => i.id === b.to)!
    if (!this.frozen) this.notices.push({ title: `Bridge open!`, detail: `The ${s.name} is open — new plots, buildings and the ${s.yard.name}`, message: null, emoji: '🌉', button: "Let's go!" })
    this.save()
    this.markDirty()
  }

  // A watched ad: a quarter of the bridge's full build time off.
  speedUpBridge() {
    const b = this.bridgeBuild
    if (!b) return
    const s = ISLANDS.find((i) => i.id === b.to)!
    b.endsAt -= (s.unlock?.buildMinutes ?? 0) * 60_000 * BRIDGE_AD_SHARE
    this.checkBridgeBuild()
    this.save()
    this.markDirty()
  }

  // A watched ad: knock a quarter of the full build time off.
  speedUpYard() {
    const b = this.yardBuild
    if (!b) return
    b.endsAt -= yardBuildSeconds(b.level + 1) * 1000 * YARD_AD_SHARE
    this.checkYardBuild()
    this.save()
    this.markDirty()
  }

  // `yard`: which island's yard, for yard upgrades.
  buyUpgrade(key: UpgradeKey, yard = 0): boolean {
    const u = isYardKey(key) ? this.yardU(yard) : this.upgrades
    if (isYardKey(key) && !this.islandOpen(ISLANDS[yard]?.id ?? 'houses')) return false
    const cost = upgradeCost(key, u[key])
    if (this.scrap < cost || upgradeLock(key, u, levelForXp(this.xp), this.truckCapacity())) return false
    if (key === 'yardSize') {
      // Expansions are built over time, not instantly (one at a time).
      if (this.yardBuild) return false
      this.scrap -= cost
      const now = Date.now()
      const level = u.yardSize + 1
      this.yardBuild = { yard, level, startedAt: now, endsAt: now + yardBuildSeconds(level + 1) * 1000 }
      this.save()
      this.markDirty()
      return true
    }
    if (isYardKey(key)) {
      this.scrap -= cost
      this.yardLevels[yard][YARD_FIELD[key]]++
      this.markDirty()
      return true
    }
    this.scrap -= cost
    this.upgrades = { ...this.upgrades, [key]: this.upgrades[key] + 1 }
    this.syncWorkers()
    this.markDirty()
    return true
  }

  startBuilding(plot: number, id: string): string | null {
    const site = this.plots[plot]
    if (!site || site.phase !== 'empty') return 'This plot is busy'
    const def = getBuilding(id)
    if (def.id !== id || (def.shape && !def.available)) return "That building isn't available right now"
    if (levelForXp(this.xp) < def.requiredLevel) return `Reach level ${def.requiredLevel} first`
    if (def.harbour && !PLOT_SLOTS[plot]?.harbour) return 'Too big for a city plot — build it on a harbour lot'
    if ((def.island ?? 'city') !== PLOT_SLOTS[plot]?.island) return 'That building belongs on another island'
    const price = buildPrice(def.contractCost)
    if (this.scrap < price) return 'Not enough bricks for this contract'
    this.scrap -= price
    site.phase = 'demolishing'
    site.rubble = []
    site.worked = 0
    site.loadBuilding(def)
    this.logActivity({ kind: 'building_started', building: def.id, name: def.name })
    this.save()
    this.markDirty()
    return null
  }

  // Tap the cleared site: collect the completion bonus. The plot is then
  // empty, and the HUD opens the building picker for it.
  claimPlot(plot: number): number {
    const site = this.plots[plot]
    if (!site || site.phase !== 'cleared') return 0
    const bonus = site.building.bonus
    this.scrap += bonus
    this.sitesCleared++
    site.phase = 'empty'
    site.clearBricks()
    this.save()
    this.markDirty()
    return bonus
  }

  // Plots unlock in order; the next one up for sale is plots.length.
  buyPlot(): string | null {
    const slot = PLOT_SLOTS[this.plots.length]
    if (!slot) return 'No more plots for sale'
    if (!this.islandOpen(slot.island)) return `Build the bridge to the ${ISLANDS.find((s) => s.id === slot.island)!.name} first`
    if (levelForXp(this.xp) < slot.requiredLevel) return `Reach level ${slot.requiredLevel} first`
    const price = buildPrice(slot.cost)
    if (this.scrap < price) return 'Not enough bricks'
    this.scrap -= price
    const site = new Site(slot.id)
    this.plots.push(site)
    if (this.crewPlan) this.crewPlan.push(0)
    this.moveBigToHarbour()
    this.save()
    this.markDirty()
    return null
  }

  // A harbour-sized building being demolished on a city plot (from before
  // the harbour existed) moves to an empty harbour lot, progress and all.
  private moveBigToHarbour() {
    for (const lot of this.plots) {
      if (!PLOT_SLOTS[lot.id]?.harbour || lot.phase !== 'empty') continue
      const from = this.plots.find((p) => !PLOT_SLOTS[p.id]?.harbour && p.phase === 'demolishing' && p.building.harbour)
      if (!from) return
      lot.phase = 'demolishing'
      lot.worked = from.worked
      lot.loadBuilding(from.building, from.removed.slice())
      for (const r of from.rubble) lot.spawnRubble(r.color, 0)
      // The old plot is free again; its crew drops what they were doing.
      for (const w of this.workers) if (w.plot === from.id) this.releaseTarget(w)
      for (const w of this.workers) if (w.plot === from.id && !w.carrying) w.state = 'idle'
      from.phase = 'empty'
      from.rubble = []
      from.clearBricks()
      this.markDirty()
    }
  }

  // ── Crew split ────────────────────────────────────────────────────────

  // How many workers each plot should have. Only plots that are being
  // demolished get anyone; by default the crew splits evenly, or follows
  // the player's manual plan (topped up / trimmed so it always adds up).
  desiredCrew(): number[] {
    const out = this.plots.map(() => 0)
    const active = this.plots.filter((p) => p.phase === 'demolishing').map((p) => p.id)
    const total = this.workers.length
    if (!active.length) return out
    if (!this.crewPlan) {
      // Auto: split by work left (bricks still standing, tougher ones
      // counting more, plus rubble), at least one each.
      const work = active.map((id) => {
        const p = this.plots[id]
        return p.bricksLeft * (p.building.toughness ?? 1) + p.rubble.length + 1
      })
      const sum = work.reduce((a, b) => a + b, 0)
      let given = 0
      active.forEach((id, n) => {
        out[id] = Math.min(total, Math.max(total >= active.length ? 1 : 0, Math.floor((work[n] / sum) * total)))
        given += out[id]
      })
      // Hand out what rounding left over to the plots with the most work.
      const order = active.map((id, n) => ({ id, w: work[n] })).sort((a, b) => b.w - a.w)
      for (let k = 0; given < total; k++, given++) out[order[k % order.length].id]++
      for (let k = order.length - 1; given > total; k = (k + order.length - 1) % order.length) {
        if (out[order[k].id] > 1) {
          out[order[k].id]--
          given--
        }
      }
      return out
    }
    for (const id of active) out[id] = this.crewPlan[id] ?? 0
    let sum = active.reduce((n, id) => n + out[id], 0)
    while (sum < total) {
      const id = active.reduce((a, b) => (out[b] < out[a] ? b : a))
      out[id]++
      sum++
    }
    while (sum > total) {
      const id = active.reduce((a, b) => (out[b] > out[a] ? b : a))
      out[id]--
      sum--
    }
    return out
  }

  // +1 pulls a worker from the busiest other plot; -1 sends one to the
  // quietest other plot. Needs at least two plots being demolished.
  adjustCrew(plot: number, delta: 1 | -1) {
    const plan = this.desiredCrew()
    const others = this.plots.filter((p) => p.phase === 'demolishing' && p.id !== plot).map((p) => p.id)
    if (!others.length || this.plots[plot]?.phase !== 'demolishing') return
    if (delta > 0) {
      const from = others.reduce((a, b) => (plan[b] > plan[a] ? b : a))
      if (plan[from] === 0) return
      plan[from]--
      plan[plot]++
    } else {
      if (plan[plot] === 0) return
      const to = others.reduce((a, b) => (plan[b] < plan[a] ? b : a))
      plan[plot]--
      plan[to]++
    }
    this.crewPlan = plan
    this.markDirty()
  }

  // The crew screen's slider: put exactly `n` workers on a plot, taking
  // them from (or giving them to) the other plots, biggest first.
  setCrew(plot: number, n: number) {
    const plan = this.desiredCrew()
    const others = this.plots.filter((p) => p.phase === 'demolishing' && p.id !== plot).map((p) => p.id)
    if (this.plots[plot]?.phase !== 'demolishing') return
    const total = this.workers.length
    n = Math.max(0, Math.min(total, Math.round(n)))
    if (!others.length) return
    let diff = n - plan[plot]
    while (diff > 0) {
      const from = others.reduce((a, b) => (plan[b] > plan[a] ? b : a))
      if (plan[from] === 0) break
      plan[from]--
      plan[plot]++
      diff--
    }
    while (diff < 0) {
      const to = others.reduce((a, b) => (plan[b] < plan[a] ? b : a))
      plan[to]++
      plan[plot]--
      diff++
    }
    this.crewPlan = plan
    this.markDirty()
  }

  // Even split across the plots being demolished (a manual plan, so it
  // stays even rather than following work left).
  setCrewEven() {
    const active = this.plots.filter((p) => p.phase === 'demolishing').map((p) => p.id)
    const total = this.workers.length
    const plan = this.plots.map(() => 0)
    active.forEach((id, n) => (plan[id] = Math.floor(total / active.length) + (n < total % active.length ? 1 : 0)))
    this.crewPlan = plan
    this.markDirty()
  }

  // Which quick choice the current split matches (for the crew sheet).
  crewMode(): 'work' | 'even' | 'custom' {
    if (!this.crewPlan) return 'work'
    const active = this.plots.filter((p) => p.phase === 'demolishing').map((p) => p.id)
    const want = this.desiredCrew()
    const vals = active.map((id) => want[id])
    return Math.max(...vals) - Math.min(...vals) <= 1 ? 'even' : 'custom'
  }

  setCrewAuto() {
    this.crewPlan = null
    this.markDirty()
  }

  // Moves idle workers from over-staffed plots to under-staffed ones. Busy
  // workers finish what they're doing first (carriers drop their brick).
  private rebalanceCrew() {
    if (this.plots.length < 2) return
    const want = this.desiredCrew()
    if (want.every((n) => n === 0)) return
    const have = this.plots.map(() => 0)
    for (const w of this.workers) have[w.plot]++
    for (const w of this.workers) {
      if (have[w.plot] <= want[w.plot] || w.carrying || w.state === 'picking') continue
      const to = want.findIndex((n, id) => have[id] < n)
      if (to < 0) break
      this.releaseTarget(w)
      have[w.plot]--
      have[to]++
      Object.assign(w, this.newWorker(w.id, to))
    }
  }

  private releaseTarget(w: Worker) {
    const site = this.plots[w.plot]
    const t = w.target
    if (t?.kind === 'brick') site.claimed[t.index] = 0
    else if (t?.kind === 'rubble') {
      const r = site.rubble.find((r) => r.id === t.id)
      if (r) r.claimed = false
    }
    w.target = null
  }

  claimBonus(amount: number) {
    this.scrap += amount
    this.markDirty()
  }

  dismissOffline() {
    this.offlineEarnings = 0
    this.markDirty()
  }

  // ── Simulation ────────────────────────────────────────────────────────

  // Bricks per second the whole fleet can haul, lapping every plot.
  private fleetRate(): number {
    const y = this.trucks[0]?.home ?? 0
    const stops = [yardGateOut(y), ...this.plots.map((p) => plotStop(p.id)), yardGateIn(y)]
    // Plus the drive through the yard: in, to the bay, and back out.
    let length = 20
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i]
      length += routeLength(planRoute(from, stops[i + 1]), { x: from.x, z: from.line })
    }
    return this.trucks.reduce((rate, t) => {
      const lap = length / stats.truckSpeed(t.speed) + this.plots.length * LOAD_SECONDS + stats.unloadSeconds(this.yardU(t.home))
      return rate + stats.truckCargo(t.load) / lap
    }, 0)
  }

  private pay(bricks: number, value: number) {
    value *= eventMultiplier('double_bricks') * T('brickValue')
    this.scrap += value
    this.xp += bricks * eventMultiplier('double_xp') * T('xpRate')
    this.recentHauls.push({ t: this.time, value })
    this.markDirty()
  }

  private siteEmpty(site: Site) {
    return site.bricksLeft === 0 && site.rubble.length === 0 && !this.workers.some((w) => w.plot === site.id && w.carrying)
  }

  private checkCleared(site: Site) {
    if (site.phase === 'demolishing' && this.siteEmpty(site) && site.dumpsterLoad === 0 && !this.loadingAt(site)) {
      site.phase = 'cleared'
      this.logActivity({ kind: 'building_finished', building: site.building.id, name: site.building.name, seconds: Math.round(site.worked) })
      this.save()
      this.markDirty()
    }
  }

  // Sets where a worker is walking to, routed around the building.
  private walkTo(w: Worker, site: Site, x: number, z: number) {
    w.tx = x
    w.tz = z
    w.via = site.detour(w.x, w.z, x, z)
  }

  private moveToward(w: Worker, dt: number): boolean {
    let step = stats.walkSpeed(this.upgrades) * this.boostMul() * dt
    // Corners first (walking round the building), then the spot itself.
    while (w.via.length) {
      const c = w.via[0]
      const d = Math.hypot(c.x - w.x, c.z - w.z)
      if (d > step) {
        w.x += ((c.x - w.x) / d) * step
        w.z += ((c.z - w.z) / d) * step
        w.heading = Math.atan2(c.x - w.x, c.z - w.z)
        return false
      }
      w.x = c.x
      w.z = c.z
      step -= d
      w.via.shift()
    }
    const dx = w.tx - w.x
    const dz = w.tz - w.z
    const dist = Math.hypot(dx, dz)
    if (dist <= step) {
      w.x = w.tx
      w.z = w.tz
      return true
    }
    w.x += (dx / dist) * step
    w.z += (dz / dist) * step
    w.heading = Math.atan2(dx, dz)
    return false
  }

  private assignTarget(w: Worker, site: Site) {
    let bestRubble: Rubble | null = null
    let bestDist = Infinity
    for (const r of site.rubble) {
      if (r.claimed || r.readyAt > this.time) continue
      const d = (r.x - w.x) ** 2 + (r.z - w.z) ** 2
      if (d < bestDist) {
        bestDist = d
        bestRubble = r
      }
    }
    if (bestRubble) {
      bestRubble.claimed = true
      w.target = { kind: 'rubble', id: bestRubble.id }
      this.walkTo(w, site, bestRubble.x, bestRubble.z)
      w.state = 'toPick'
      return
    }

    // This worker's place in the plot's crew sets its side of the building.
    let slot = 0
    let crew = 0
    for (const o of this.workers) {
      if (o.plot !== site.id) continue
      crew++
      if (o.id < w.id) slot++
    }
    const home = site.homeSpot(slot, crew)
    // Skip bricks whose standing spot someone else already has, so the
    // crew doesn't pile up on one spot.
    const taken = this.workers
      .filter((o) => o !== w && o.plot === site.id && (o.state === 'toPick' || o.state === 'picking') && o.target?.kind === 'brick')
      .map((o) => ({ x: o.tx, z: o.tz }))
    const skipped: number[] = []
    let i = -1
    let spot = { x: 0, z: 0 }
    for (let tries = 0; tries < 8; tries++) {
      i = site.pickTopBrick(home)
      if (i < 0) break
      spot = site.standSpot(i)
      if (!taken.some((t) => (t.x - spot.x) ** 2 + (t.z - spot.z) ** 2 < 0.35 * 0.35)) break
      site.claimed[i] = 1
      skipped.push(i)
      if (tries === 7) i = skipped.shift() ?? -1 // everywhere's busy: share a spot
    }
    for (const k of skipped) site.claimed[k] = 0
    if (i >= 0) {
      site.claimed[i] = 1
      w.target = { kind: 'brick', index: i }
      this.walkTo(w, site, spot.x, spot.z)
      w.state = 'toPick'
    }
  }

  // Which dumpster to take bricks to: the shortest line among those with
  // room, or null if they're all full or backed up (then wait aside).
  private chooseDumpster(w: Worker, site: Site): number | null {
    const walking = site.dumpsters.map(() => 0)
    for (const o of this.workers) if (o.plot === site.id && o.state === 'toDumpster' && o !== w) walking[o.dumpster]++
    let best: number | null = null
    let bestScore = Infinity
    site.dumpsters.forEach((d, i) => {
      const room = stats.dumpsterCapacity(d.level) - d.load
      const line = d.queue.length + walking[i]
      if (room <= 0 || line >= MAX_LINE) return
      const score = line * 1000 - room
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    })
    return best
  }

  private headForDumpster(w: Worker, site: Site) {
    const d = this.chooseDumpster(w, site)
    if (d === null) {
      // Everything's full: wait off to the side with the bricks.
      w.state = 'holding'
      const holders = this.workers.filter((o) => o.plot === site.id && o.state === 'holding' && o !== w).length
      w.dumpster = Math.min(w.dumpster, site.dumpsters.length - 1)
      const spot = site.holdSpot(w.dumpster, holders)
      this.walkTo(w, site, spot.x, spot.z)
      return
    }
    w.state = 'toDumpster'
    w.dumpster = d
    const tail = site.queueSpot(d, site.dumpsters[d].queue.length)
    this.walkTo(w, site, tail.x, tail.z)
  }

  tick(dt: number) {
    dt = Math.min(dt, 0.1)
    this.time += dt
    const u = this.upgrades
    if (this.yardBuild) this.checkYardBuild()
    if (this.bridgeBuild) this.checkBridgeBuild()
    for (const site of this.plots) if (site.phase === 'demolishing') site.worked += dt

    this.rebalanceCrew()

    for (const w of this.workers) {
      const site = this.plots[w.plot]
      switch (w.state) {
        case 'idle':
          if (site.phase === 'demolishing') this.assignTarget(w, site)
          break
        case 'toPick':
          if (this.moveToward(w, dt)) {
            w.state = 'picking'
            const t = w.target
            // Bricks still in the building can be tougher (big late
            // buildings); rubble on the ground is always quick.
            w.timer = (stats.pullSeconds(u) * (t?.kind === 'brick' ? (site.building.toughness ?? 1) : 1)) / this.boostMul()
            if (t?.kind === 'brick') {
              const b = site.bricks[t.index]
              w.heading = Math.atan2(b.x * BRICK - w.x, b.z * BRICK - w.z)
            }
          }
          break
        case 'picking':
          w.timer -= dt
          if (w.timer <= 0) {
            const t = w.target
            if (t?.kind === 'brick') {
              w.carrying = site.bricks[t.index].color
              w.held++
              site.removeBrick(t.index)
              site.events.push({ type: 'brickPulled', index: t.index, workerId: w.id })
              this.markDirty()
            } else if (t?.kind === 'rubble') {
              const idx = site.rubble.findIndex((r) => r.id === t.id)
              if (idx >= 0) {
                w.carrying = site.rubble[idx].color
                w.held++
                site.rubble.splice(idx, 1)
                site.events.push({ type: 'rubblePicked', id: t.id })
              }
            }
            w.target = null
            // Room for more? Grab the next brick before the walk back.
            if (w.held > 0 && w.held < stats.carry(u)) {
              this.assignTarget(w, site)
              if ((w.state as WorkerState) === 'toPick') break
            }
            if (w.carrying) {
              this.headForDumpster(w, site)
            } else {
              w.state = 'idle'
            }
          }
          break
        case 'toDumpster': {
          // Head for the back of the line (it may have moved since setting
          // off) and join it on arrival.
          const dumpster = site.dumpsters[w.dumpster] ?? site.dumpsters[(w.dumpster = 0)]
          // Filled up (or backed up) on the way: pick again.
          if (dumpster.load >= stats.dumpsterCapacity(dumpster.level) || dumpster.queue.length >= MAX_LINE) {
            this.headForDumpster(w, site)
            break
          }
          const tail = site.queueSpot(w.dumpster, dumpster.queue.length)
          w.tx = tail.x
          w.tz = tail.z
          if (this.moveToward(w, dt)) {
            dumpster.queue.push(w.id)
            w.state = 'waiting'
          }
          break
        }
        case 'holding': {
          // Waiting aside; join a line as soon as a dumpster has room.
          this.moveToward(w, dt)
          if (this.chooseDumpster(w, site) !== null) this.headForDumpster(w, site)
          break
        }
        case 'waiting': {
          const dumpster = site.dumpsters[w.dumpster]
          const place = dumpster.queue.indexOf(w.id)
          const spot = site.queueSpot(w.dumpster, Math.max(0, place))
          w.tx = spot.x
          w.tz = spot.z
          // Shuffle up as the line moves, then face the front of the line.
          if (!this.moveToward(w, dt)) break
          const dir = DUMPSTER_SLOTS[w.dumpster].dir
          w.heading = Math.atan2(-dir.x, -dir.z)
          const capacity = stats.dumpsterCapacity(dumpster.level)
          // Full: everyone behind the front of the line steps aside to wait.
          if (place > 0 && dumpster.load >= capacity) {
            dumpster.queue.splice(place, 1)
            this.headForDumpster(w, site)
            break
          }
          if (place === 0 && dumpster.load < capacity && !this.loadingAt(site)) {
            const n = Math.min(w.held, capacity - dumpster.load)
            dumpster.load += n
            w.held -= n
            if (w.held === 0) {
              w.carrying = null
              w.state = 'idle'
              dumpster.queue.shift()
            }
            this.markDirty()
          }
          break
        }
      }
    }

    this.tickTrucks(dt)
    for (const site of this.plots) this.checkCleared(site)

    // Keep the boost pill's countdown ticking in the HUD.
    const boostSecond = Math.ceil(Math.max(0, this.boostUntil - this.time))
    if (boostSecond !== this.lastBoostSecond) {
      this.lastBoostSecond = boostSecond
      this.markDirty()
    }

    this.tickBonus(dt)
    this.recentHauls = this.recentHauls.filter((h) => this.time - h.t < 60)

    if (!this.replaying && this.dirty && this.time - this.lastFlush > 0.12) this.flush()
  }

  // ── Bonus drop ────────────────────────────────────────────────────────

  bonusDrop: { amount: number; droppedAt: number; expiresAt: number } | null = null
  lastBonusClaim: { at: number; amount: number } | null = null
  private trailerStart = -1
  private trailerDropped = false
  private nextBonusAt = nextBonusDelay()
  private lastBonusSecond = -1
  bonusHeld = false

  // -1 when no trailer is passing, otherwise 0→1 across the screen.
  trailerProgress(): number {
    return this.trailerStart < 0 ? -1 : Math.min(1, (this.time - this.trailerStart) / TRAILER_SECONDS)
  }

  private tickBonus(dt: number) {
    if (this.trailerStart < 0 && !this.bonusDrop && this.home.phase === 'demolishing' && this.time >= this.nextBonusAt) {
      this.startTrailer()
    }
    if (this.trailerStart >= 0) {
      const p = this.trailerProgress()
      if (!this.trailerDropped && p >= TRAILER_DROP_AT) {
        this.trailerDropped = true
        this.bonusDrop = {
          amount: Math.max(1, Math.round(stats.truckCargo(this.trucks[0]?.load ?? 0) * 2 * T('bonusDrop'))),
          droppedAt: this.time,
          expiresAt: this.time + BONUS_LIFETIME_SECONDS,
        }
        this.markDirty()
      }
      if (p >= 1) {
        this.trailerStart = -1
        this.nextBonusAt = this.time + nextBonusDelay()
      }
    }
    if (this.bonusDrop) {
      // The countdown holds while the claim card (and its ad) is open.
      if (this.bonusHeld) this.bonusDrop.expiresAt += dt
      if (this.time >= this.bonusDrop.expiresAt) {
        this.bonusDrop = null
        this.markDirty()
      } else {
        const second = Math.ceil(this.bonusDrop.expiresAt - this.time)
        if (second !== this.lastBonusSecond) {
          this.lastBonusSecond = second
          this.markDirty()
        }
      }
    }
  }

  // Also callable from the console in dev to test without waiting minutes.
  startTrailer() {
    this.trailerStart = this.time
    this.trailerDropped = false
  }

  // Freezes the countdown while the claim card (and its ad) is open.
  holdBonusDrop(held: boolean) {
    this.bonusHeld = held
  }

  // Ignored too long: a seagull made off with it.
  loseBonusDrop() {
    this.bonusDrop = null
    this.bonusHeld = false
    this.markDirty()
  }

  claimBonusDrop() {
    if (!this.bonusDrop) return
    this.home.dumpsters[0].load += this.bonusDrop.amount
    this.lastBonusClaim = { at: this.time, amount: this.bonusDrop.amount }
    this.bonusDrop = null
    this.bonusHeld = false
    this.markDirty()
  }

  // ── Dumpsters (per plot) ──────────────────────────────────────────────

  buyDumpster(plot: number): boolean {
    const site = this.plots[plot]
    const cost = site ? dumpsterBuyCost(site.dumpsters.length) : null
    if (!site || cost === null || this.scrap < cost) return false
    this.scrap -= cost
    site.dumpsters.push({ level: 0, load: 0, queue: [] })
    this.markDirty()
    return true
  }

  upgradeDumpster(plot: number, index: number): boolean {
    const d = this.plots[plot]?.dumpsters[index]
    if (!d) return false
    const cost = dumpsterUpgradeCost(d.level)
    if (this.scrap < cost) return false
    this.scrap -= cost
    d.level++
    this.markDirty()
    return true
  }

  // ── Trucks ────────────────────────────────────────────────────────────

  buyTruckUpgrade(truckId: number, key: TruckUpgrade): boolean {
    const truck = this.trucks[truckId]
    if (!truck) return false
    const cost = truckUpgradeCost(key, truck[key])
    if (this.scrap < cost) return false
    this.scrap -= cost
    truck[key]++
    this.markDirty()
    return true
  }

  private lastDeparture = -Infinity

  // The dock at yard `y` with the shortest line (trucks heading to or using it).
  private pickDock(truck: Truck, y: number): number {
    const n = stats.docks(this.yardU(y))
    let best = 0
    let bestLine = Infinity
    for (let k = 0; k < n; k++) {
      const line = this.trucks.filter((t) => t !== truck && t.dest.kind === 'yard' && t.yard === y && t.dock === k).length
      if (line < bestLine) {
        best = k
        bestLine = line
      }
    }
    return best
  }

  // Builds the route: out of the yard it's in by the OUT gate (unless it's
  // staying in that yard), along the roads and over bridges, and in by the
  // IN gate of the yard it's going to — to a dock, or on to a parking bay
  // (or the kerb, if its home yard is full).
  private driveTo(truck: Truck, dest: Truck['dest']) {
    const path: Point[] = []
    const target = dest.kind === 'yard' ? this.unloadYard(truck) : dest.kind === 'park' ? truck.home : -1
    let from: RoadSpot | null = truck.inYard ? null : truck.at
    const kerb = this.kerbIndex(truck)
    const rank = this.parkRank(truck)
    if (truck.inYard) {
      const cur = truck.yard
      // Back-row bays reach the bay line by the side lane first.
      const out = truck.inYard === 'parked' ? unparkPath(cur, rank) : []
      const staysIn = target === cur && (dest.kind === 'yard' || (dest.kind === 'park' && kerb === null))
      if (!staysIn) {
        path.push(...out, ...yardExitPath(cur, out.length ? out[out.length - 1] : { x: truck.x, z: truck.z }))
        from = yardGateOut(cur)
      } else if (dest.kind === 'park') {
        if (truck.inYard === 'bay') path.push(...parkPath(cur, rank))
      } else {
        truck.dock = this.pickDock(truck, cur)
        path.push(...out, dockPoint(cur, truck.dock))
      }
    }
    if (from) {
      if (dest.kind === 'plot') path.push(...planRoute(from, plotStop(dest.plot)))
      else if (dest.kind === 'park' && kerb !== null) {
        const spot = kerbSpot(truck.home, kerb)
        path.push(...planRoute(from, spot), ...kerbPath(spot))
      } else {
        if (dest.kind === 'yard') truck.dock = this.pickDock(truck, target)
        path.push(...planRoute(from, yardGateIn(target)), ...yardEnterPath(target, dest.kind === 'yard' ? truck.dock : 0))
        if (dest.kind === 'park') path.push(...parkPath(target, rank))
      }
    }
    if (target >= 0) truck.yard = target
    truck.path = path
    truck.dest = dest
    truck.state = 'driving'
  }

  // Where to next: unload if full; else the next plot this lap with
  // anything in its dumpster; else unload whatever's aboard to end the
  // lap; else park at the yard until there's something to collect.
  private nextStop(truck: Truck) {
    if (truck.cargo >= stats.truckCargo(truck.load)) return this.driveTo(truck, { kind: 'yard' })
    for (let i = truck.lap; i < this.plots.length; i++) {
      if (this.plots[i].dumpsterLoad > 0) {
        truck.lap = i + 1
        return this.driveTo(truck, { kind: 'plot', plot: i })
      }
    }
    truck.lap = this.plots.length
    if (truck.cargo > 0) return this.driveTo(truck, { kind: 'yard' })
    truck.lap = 0
    this.driveTo(truck, { kind: 'park' })
  }

  private tickTrucks(dt: number) {
    for (const truck of this.trucks) {
      switch (truck.state) {
        case 'parked':
          // Leave one at a time so the fleet drives in a line.
          if (this.time - this.lastDeparture > 2.2 && this.plots.some((p) => p.dumpsterLoad > 0)) {
            this.lastDeparture = this.time
            truck.lap = 0
            this.nextStop(truck)
          }
          break
        case 'driving':
          this.driveTruck(truck, dt)
          break
        case 'loading':
          truck.timer -= dt
          if (truck.timer <= 0 && truck.dest.kind === 'plot') {
            const site = this.plots[truck.dest.plot]
            // Empty the fullest dumpsters first.
            let room = stats.truckCargo(truck.load) - truck.cargo
            let n = 0
            for (const d of [...site.dumpsters].sort((a, b) => b.load - a.load)) {
              const take = Math.min(room, d.load)
              d.load -= take
              room -= take
              n += take
            }
            truck.cargo += n
            truck.cargoValue += n * site.building.brickValue
            this.markDirty()
            this.nextStop(truck)
          }
          break
        case 'unloading':
          truck.timer -= dt
          if (truck.timer <= 0) {
            this.pay(truck.cargo, truck.cargoValue * (1 + stats.priceBonus(this.yardU(truck.yard))))
            truck.cargo = 0
            truck.cargoValue = 0
            if (truck.lap >= this.plots.length) truck.lap = 0
            this.nextStop(truck)
          }
          break
      }
    }
  }

  private driveTruck(truck: Truck, dt: number) {
    // Queue behind a truck just ahead in the same lane.
    const fx = Math.sin(truck.heading)
    const fz = Math.cos(truck.heading)
    // Wait behind a truck just ahead going the same way. Parked trucks
    // are off the road and oncoming or crossing ones pass by. If trucks
    // still end up waiting on each other (turning at a crossroads), any
    // truck held up for a few seconds squeezes past, so traffic can never
    // lock up for good.
    let blocked = false
    if (truck.squeeze <= 0) {
      for (const other of this.trucks) {
        if (other === truck || other.state === 'parked') continue
        if (Math.sin(other.heading) * fx + Math.cos(other.heading) * fz < 0.7) continue
        const dx = other.x - truck.x
        const dz = other.z - truck.z
        const ahead = dx * fx + dz * fz
        const side = Math.abs(dx * fz - dz * fx)
        if (ahead > 0 && ahead < 2.6 && side < 0.4) {
          blocked = true
          break
        }
      }
    } else truck.squeeze -= dt
    if (blocked) {
      truck.stuck += dt
      if (truck.stuck < 2.5) return
      truck.stuck = 0
      truck.squeeze = 1.5
    } else if (truck.squeeze <= 0) truck.stuck = 0

    let step = stats.truckSpeed(truck.speed) * dt
    while (step > 0 && truck.path.length) {
      const p = truck.path[0]
      const dx = p.x - truck.x
      const dz = p.z - truck.z
      const dist = Math.hypot(dx, dz)
      if (dist > 0.001) truck.heading = Math.atan2(dx, dz)
      if (dist <= step) {
        truck.x = p.x
        truck.z = p.z
        truck.path.shift()
        step -= dist
      } else {
        truck.x += (dx / dist) * step
        truck.z += (dz / dist) * step
        step = 0
      }
    }
    if (truck.path.length) return

    if (truck.dest.kind === 'plot') {
      truck.at = plotStop(truck.dest.plot)
      truck.inYard = null
      truck.state = 'loading'
      truck.timer = LOAD_SECONDS
    } else if (truck.dest.kind === 'yard') {
      truck.inYard = 'bay'
      truck.state = 'unloading'
      truck.timer = stats.unloadSeconds(this.yardU(truck.yard))
    } else {
      const kerb = this.kerbIndex(truck)
      if (kerb === null) truck.inYard = 'parked'
      else {
        truck.inYard = null
        truck.at = kerbSpot(truck.home, kerb)
      }
      truck.state = 'parked'
    }
    this.markDirty()
  }

  // ── Subscription (HUD) ────────────────────────────────────────────────

  markDirty() {
    this.dirty = true
  }

  private flush() {
    this.dirty = false
    this.lastFlush = this.time
    this.snapshot = null
    for (const l of this.listeners) l()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // Force a HUD refresh for changes made outside tick() (purchases, picks).
  notify() {
    this.flush()
  }

  getSnapshot = (): Snapshot => {
    if (!this.snapshot) {
      const span = Math.max(10, Math.min(60, this.time))
      const earned = this.recentHauls.reduce((n, h) => n + h.value, 0)
      const crew = this.plots.map(() => 0)
      for (const w of this.workers) crew[w.plot]++
      const crewTarget = this.desiredCrew()
      this.snapshot = {
        scrap: this.scrap,
        xp: this.xp,
        level: levelForXp(this.xp),
        upgrades: this.upgrades,
        plots: this.plots.map((p) => ({
          id: p.id,
          phase: p.phase,
          buildingId: p.building.id,
          bricksTotal: p.bricks.length,
          bricksLeft: p.bricksLeft,
          rubbleLeft: p.rubble.length,
          dumpsterLoad: p.dumpsterLoad,
          dumpsters: p.dumpsters.map((d) => ({ level: d.level, load: d.load, capacity: stats.dumpsterCapacity(d.level) })),
          truckState: this.truckAt(p)?.state ?? 'away',
          crew: crew[p.id],
          crewTarget: crewTarget[p.id],
        })),
        trucks: this.trucks.map((t) => ({ id: t.id, load: t.load, speed: t.speed, cargo: t.cargo, state: t.state })),
        crewAuto: this.crewPlan === null,
        crewMode: this.crewMode(),
        incomePerMinute: Math.round((earned / span) * 60),
        offlineEarnings: this.offlineEarnings,
        sitesCleared: this.sitesCleared,
        boostLeft: Math.max(0, Math.ceil(this.boostUntil - this.time)),
        notice: this.notices[0] ?? null,
        catchUp: this.catchUpLeft > 0 && this.catchUpTotal > 0 ? 1 - this.catchUpLeft / this.catchUpTotal : null,
        shortId: this.shortId,
        username: this.username,
        synced: this.synced,
        ban: this.ban,
        islands: ISLANDS.map((s) => ({ id: s.id, open: this.islandOpen(s.id), yard: this.yardLevels[s.index] })),
        truckCapacity: this.truckCapacity(),
        bridgeBuild: this.bridgeBuild
          ? {
              to: this.bridgeBuild.to,
              secondsLeft: Math.max(0, Math.ceil((this.bridgeBuild.endsAt - Date.now()) / 1000)),
              totalSeconds: (ISLANDS.find((s) => s.id === this.bridgeBuild!.to)?.unlock?.buildMinutes ?? 0) * 60,
            }
          : null,
        yardBuild: this.yardBuild
          ? {
              yard: this.yardBuild.yard,
              toSize: this.yardBuild.level + 1,
              secondsLeft: Math.max(0, Math.ceil((this.yardBuild.endsAt - Date.now()) / 1000)),
              totalSeconds: yardBuildSeconds(this.yardBuild.level + 1),
            }
          : null,
        events: liveEvents.filter((e) => new Date(e.startsAt).getTime() <= Date.now() && new Date(e.endsAt).getTime() > Date.now()),
        banners: this.banners,
        bonusDrop: this.bonusDrop
          ? { amount: this.bonusDrop.amount, secondsLeft: Math.ceil(this.bonusDrop.expiresAt - this.time) }
          : null,
      }
    }
    return this.snapshot
  }
}

// v4 saves had a single site; it becomes your home plot.
function migrateLegacy(old: LegacySave): SaveData {
  const u = old.upgrades
  return {
    scrap: old.scrap,
    xp: old.xp,
    upgrades: {
      tools: u.tools ?? u.hammer ?? 0,
      speed: u.speed ?? 0,
      workers: u.workers ?? 0,
      fleet: 0,
      yardSize: 0,
      yardDocks: 0,
      yardSpeed: 0,
      yardBonus: 0,
    },
    trucks: [{ load: u.truck ?? 0, speed: 0 }],
    crewPlan: null,
    sitesCleared: old.sitesCleared ?? 0,
    lastSeen: old.lastSeen,
    plots: [
      {
        phase: old.phase === 'picking' ? 'empty' : 'demolishing',
        buildingId: old.buildingId,
        removed: old.removed,
        rubble: old.rubble,
        dumpsters: [{ level: u.dumpster ?? u.truck ?? 0, load: old.dumpsterLoad }],
      },
    ],
  }
}

let instance: Engine | null = null

export function getEngine(): Engine {
  if (!instance) {
    // Admin-made buildings from last time, so saves using them load even
    // before the game has checked the server.
    try {
      const cached = localStorage.getItem(CUSTOM_BUILDINGS_KEY)
      if (cached) registerCustomBuildings(JSON.parse(cached) as BuildingDef[])
    } catch {
      // none cached
    }
    instance = new Engine()
    instance.load()
    // Handy for poking at the simulation from the console during development.
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __rubble: Engine }).__rubble = instance
  }
  return instance
}
