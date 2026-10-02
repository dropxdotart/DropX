import { type Brick, type BrickColor } from './blueprints'
import { BUILDINGS, brickCount, bricksFor, getBuilding, levelForXp, registerCustomBuildings, sizeFor, xpForLevel, type BuildingDef } from './buildings'
import { PLOT_SLOTS } from './plots'
import {
  parkingSpot,
  parkPath,
  planRoute,
  plotStop,
  routeLength,
  YARD_BAY,
  YARD_GATE_IN,
  YARD_GATE_OUT,
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
export { BRICK, DUMPSTER, DUMPSTER_SLOTS, LOT_HALF, MAX_DUMPSTERS, ROAD_Z, TRUCK_STOP } from './layout'

const SAVE_KEY = 'rubble-save-v5'
const LEGACY_SAVE_KEY = 'rubble-save-v4'
// Set when an admin reset wipes the save, so the fresh game can say so;
// gifts sent after the reset wait here to be applied to the fresh game.
const RESET_NOTICE_KEY = 'rubble-reset-notice'
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
  yardSpeed: number
  yardBonus: number
}
export type UpgradeKey = keyof Upgrades

export const UPGRADE_INFO: Record<UpgradeKey, { label: string; base: number; growth: number }> = {
  tools: { label: 'Better tools', base: 15, growth: 1.5 },
  speed: { label: 'Walking speed', base: 25, growth: 1.45 },
  workers: { label: 'Hire worker', base: 40, growth: 1.7 },
  fleet: { label: 'Buy a truck', base: 300, growth: 2.6 },
  yardSpeed: { label: 'Faster unloading', base: 60, growth: 1.55 },
  yardBonus: { label: 'Better prices', base: 120, growth: 1.7 },
}

// Each dumpster is bought per plot and sized up on its own.
export const DUMPSTER_UPGRADE = { label: 'Bigger dumpster', base: 30, growth: 1.5 }
export function dumpsterUpgradeCost(level: number): number {
  return Math.round(DUMPSTER_UPGRADE.base * Math.pow(DUMPSTER_UPGRADE.growth, level))
}
// Price of a plot's 2nd and 3rd dumpster.
const DUMPSTER_BUY_COSTS = [0, 400, 2500]
export function dumpsterBuyCost(owned: number): number | null {
  return owned < MAX_DUMPSTERS ? DUMPSTER_BUY_COSTS[owned] : null
}

export type RewardKind = 'bricks' | 'set_bricks' | 'set_level' | 'boost' | 'upgrade' | 'reset'
export type Reward = { kind: RewardKind; amount: number; upgrade: string | null }
export type Notice = { title: string; detail: string; message: string | null }

// Upgrades a code or gift can hand out for free, as players see them.
export const REWARD_UPGRADE_LABELS: Partial<Record<UpgradeKey, string>> = {
  workers: 'worker',
  fleet: 'truck',
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
  return Math.round(info.base * Math.pow(info.growth, level))
}

export function upgradeCost(key: UpgradeKey, level: number): number {
  const info = UPGRADE_INFO[key]
  return Math.round(info.base * Math.pow(info.growth, level))
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
  pullSeconds: (u: Upgrades) => 3 / (1 + 0.15 * u.tools),
  walkSpeed: (u: Upgrades) => 2 * (1 + 0.15 * u.speed),
  workerCount: (u: Upgrades) => 1 + u.workers,
  dumpsterCapacity: (level: number) => 8 + 6 * level,
  truckCount: (u: Upgrades) => 1 + u.fleet,
  // Per truck, from that truck's own levels.
  truckCargo: (loadLevel: number) => 8 + 6 * loadLevel,
  truckSpeed: (speedLevel: number) => 6 * (1 + 0.12 * speedLevel),
  unloadSeconds: (u: Upgrades) => Math.max(0.4, 2 * Math.pow(0.88, u.yardSpeed)),
  priceBonus: (u: Upgrades) => 0.05 * u.yardBonus,
}

export type WorkerState = 'idle' | 'toPick' | 'picking' | 'toDumpster' | 'waiting'

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
  inYard: 'bay' | 'parked' | null // inside the fenced Brick Yard
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
}

export type SaveData = {
  scrap: number
  xp: number
  upgrades: Upgrades
  plots: PlotSave[]
  trucks?: { load: number; speed: number }[]
  crewPlan: number[] | null
  sitesCleared: number
  lastSeen: number
}

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

function decodeBits(encoded: string, length: number): Uint8Array {
  const bits = new Uint8Array(length)
  try {
    const s = atob(encoded)
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
  building: BuildingDef = BUILDINGS[0]
  bricks: Brick[] = []
  removed: Uint8Array = new Uint8Array(0)
  claimed: Uint8Array = new Uint8Array(0)
  bricksLeft = 0
  // Each column (unique x,z) lists its brick indices bottom→top; bricks only
  // ever leave from the top, so a pointer per column tracks the current top.
  columns: number[][] = []
  columnTop = new Int32Array(0)
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
      const score = near
        ? (b.x * BRICK - near.x) ** 2 + (b.z * BRICK - near.z) ** 2 - b.y * BRICK * 0.15
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
    const slot = DUMPSTER_SLOTS[dumpster]
    const perRow = 4
    const row = Math.floor(i / perRow)
    const col = i % perRow
    return {
      x: slot.line.x + slot.dir.x * col + slot.wrap.x * row,
      z: slot.line.z + slot.dir.z * col + slot.wrap.z * row,
    }
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
  homeSpot(w: Worker) {
    const a = w.id * 2.39996
    return { x: Math.cos(a) * (this.halfX + 2), z: Math.sin(a) * (this.halfZ + 2) }
  }

  // Where a worker stands to pull a given brick: just outside the footprint
  // on the side nearest that brick.
  standSpot(bx: number, bz: number) {
    const m = 0.45
    const nx = bx / Math.max(this.halfX, 0.01)
    const nz = bz / Math.max(this.halfZ, 0.01)
    if (Math.abs(nx) > Math.abs(nz)) return { x: Math.sign(bx || 1) * (this.halfX + m), z: bz }
    return { x: bx, z: Math.sign(bz || 1) * (this.halfZ + m) }
  }
}

export class Engine {
  time = 0
  scrap = 0
  xp = 0
  upgrades: Upgrades = { tools: 0, speed: 0, workers: 0, fleet: 0, yardSpeed: 0, yardBonus: 0 }
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

  private newTruck(id: number, levels?: { load: number; speed: number }): Truck {
    const spot = parkingSpot(id)
    return {
      id,
      load: levels?.load ?? 0,
      speed: levels?.speed ?? 0,
      state: 'parked',
      x: spot.x,
      z: spot.z,
      heading: 0,
      path: [],
      dest: { kind: 'park' },
      at: YARD_GATE_OUT,
      inYard: 'parked',
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
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────

  load() {
    this.loadSave()
    try {
      const resetMessage = localStorage.getItem(RESET_NOTICE_KEY)
      if (resetMessage !== null) {
        localStorage.removeItem(RESET_NOTICE_KEY)
        this.notices.push({ title: 'Fresh start', detail: 'Your progress was reset', message: resetMessage || null })
      }
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

  private loadSave() {
    let save: SaveData | null = null
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
    this.crewPlan = save.crewPlan ?? null
    this.trucks = (save.trucks ?? [{ load: oldTruckLevel ?? 0, speed: 0 }]).map((t, id) => this.newTruck(id, t))
    this.plots = save.plots.slice(0, PLOT_SLOTS.length).map((ps, id) => {
      const site = new Site(id)
      site.phase = ps.phase
      site.dumpsters = (ps.dumpsters ?? [{ level: oldDumpsterLevel ?? 0, load: ps.dumpsterLoad ?? 0 }])
        .slice(0, MAX_DUMPSTERS)
        .map((d) => ({ level: d.level, load: d.load, queue: [] }))
      if (ps.custom) registerCustomBuildings([ps.custom], false)
      const def = ps.custom ?? getBuilding(ps.buildingId)
      if (ps.phase === 'empty') {
        site.building = def
      } else {
        site.loadBuilding(def, decodeBits(ps.removed, brickCount(def)))
        for (let i = 0; i < ps.rubble; i++) site.spawnRubble(site.bricks[0]?.color ?? 'brick', 0)
      }
      return site
    })
    this.syncWorkers()

    this.beginCatchUp((Date.now() - save.lastSeen) / 1000)
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
      trucks: this.trucks.map((t) => ({ load: t.load, speed: t.speed })),
      plots: this.plots.map((p) => ({
        phase: p.phase,
        buildingId: p.building.id,
        removed: encodeBits(p.removed),
        // Carried bricks go back on the ground on reload rather than vanishing.
        rubble: p.rubble.length + this.workers.reduce((n, w) => n + (w.plot === p.id ? w.held : 0), 0),
        dumpsters: p.dumpsters.map((d) => ({ level: d.level, load: d.load })),
        ...(p.building.shape && p.phase !== 'empty' ? { custom: p.building } : {}),
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
        this.upgrades = { ...this.upgrades, [key]: Math.max(0, this.upgrades[key] + n) }
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

  // What the player's cloud record shows in the admin.
  cloudSummary() {
    return {
      scrap: this.scrap,
      xp: this.xp,
      level: levelForXp(this.xp),
      plots: this.plots.length,
      workers: this.workers.length,
    }
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
    const away = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, seconds))
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
          this.tick(dt)
          this.catchUpLeft -= dt
          this.catchUpReplayed += dt
        }
      }
    } finally {
      this.replaying = false
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
    const u = this.upgrades
    this.plots.forEach((site, i) => {
      if (site.phase !== 'demolishing' || this.catchUpReplayed <= 0) return
      const pace = Math.max(0, (this.catchUpStartBricks[i] ?? site.bricksLeft) - site.bricksLeft) / this.catchUpReplayed
      const available = site.bricksLeft + site.rubble.length + site.dumpsterLoad
      let hauled = Math.min(Math.floor(pace * seconds), available)
      const total = hauled
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
  }

  private finishCatchUp() {
    this.offlineEarnings += Math.max(0, Math.round(this.scrap - this.catchUpStartScrap))
    this.catchUpTotal = 0
    for (const site of this.plots) site.events.push({ type: 'resync' })
    this.save()
  }

  // The game loop's tick: paused while time away is being replayed.
  frameTick(dt: number) {
    if (this.catchUpLeft > 0) return
    this.tick(dt)
  }


  // ── Player actions ────────────────────────────────────────────────────

  boostUntil = -Infinity
  private lastBoostSecond = -1

  boostActive() {
    return this.time < this.boostUntil
  }

  private boostMul() {
    return this.boostActive() ? BOOST_FACTOR : 1
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

  buyUpgrade(key: UpgradeKey): boolean {
    const cost = upgradeCost(key, this.upgrades[key])
    if (this.scrap < cost) return false
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
    if (this.scrap < def.contractCost) return 'Not enough bricks for this contract'
    this.scrap -= def.contractCost
    site.phase = 'demolishing'
    site.rubble = []
    site.loadBuilding(def)
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
    if (levelForXp(this.xp) < slot.requiredLevel) return `Reach level ${slot.requiredLevel} first`
    if (this.scrap < slot.cost) return 'Not enough bricks'
    this.scrap -= slot.cost
    const site = new Site(slot.id)
    this.plots.push(site)
    if (this.crewPlan) this.crewPlan.push(0)
    this.save()
    this.markDirty()
    return null
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
      active.forEach((id, n) => (out[id] = Math.floor(total / active.length) + (n < total % active.length ? 1 : 0)))
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
    const stops = [YARD_GATE_OUT, ...this.plots.map((p) => plotStop(p.id)), YARD_GATE_IN]
    // Plus the drive through the yard: in, to the bay, and back out.
    let length = 20
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i]
      length += routeLength(planRoute(from, stops[i + 1]), { x: from.x, z: from.line })
    }
    return this.trucks.reduce((rate, t) => {
      const lap = length / stats.truckSpeed(t.speed) + this.plots.length * LOAD_SECONDS + stats.unloadSeconds(this.upgrades)
      return rate + stats.truckCargo(t.load) / lap
    }, 0)
  }

  private pay(bricks: number, value: number) {
    this.scrap += value
    this.xp += bricks
    this.recentHauls.push({ t: this.time, value })
    this.markDirty()
  }

  private siteEmpty(site: Site) {
    return site.bricksLeft === 0 && site.rubble.length === 0 && !this.workers.some((w) => w.plot === site.id && w.carrying)
  }

  private checkCleared(site: Site) {
    if (site.phase === 'demolishing' && this.siteEmpty(site) && site.dumpsterLoad === 0 && !this.loadingAt(site)) {
      site.phase = 'cleared'
      this.save()
      this.markDirty()
    }
  }

  private moveToward(w: Worker, dt: number): boolean {
    const dx = w.tx - w.x
    const dz = w.tz - w.z
    const dist = Math.hypot(dx, dz)
    const step = stats.walkSpeed(this.upgrades) * this.boostMul() * dt
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
      w.tx = bestRubble.x
      w.tz = bestRubble.z
      w.state = 'toPick'
      return
    }

    const i = site.pickTopBrick(site.homeSpot(w))
    if (i >= 0) {
      site.claimed[i] = 1
      const b = site.bricks[i]
      const spot = site.standSpot(b.x * BRICK, b.z * BRICK)
      w.target = { kind: 'brick', index: i }
      w.tx = spot.x
      w.tz = spot.z
      w.state = 'toPick'
    }
  }

  tick(dt: number) {
    dt = Math.min(dt, 0.1)
    this.time += dt
    const u = this.upgrades

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
            w.timer = stats.pullSeconds(u) / this.boostMul()
            const t = w.target
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
              w.state = 'toDumpster'
              // Head for whichever dumpster has the shortest line.
              const walking = site.dumpsters.map(() => 0)
              for (const o of this.workers) if (o.plot === site.id && o.state === 'toDumpster' && o !== w) walking[o.dumpster]++
              w.dumpster = site.pickDumpster(stats.dumpsterCapacity, walking)
              const tail = site.queueSpot(w.dumpster, site.dumpsters[w.dumpster].queue.length)
              w.tx = tail.x
              w.tz = tail.z
            } else {
              w.state = 'idle'
            }
          }
          break
        case 'toDumpster': {
          // Head for the back of the line (it may have moved since setting
          // off) and join it on arrival.
          const dumpster = site.dumpsters[w.dumpster] ?? site.dumpsters[(w.dumpster = 0)]
          const tail = site.queueSpot(w.dumpster, dumpster.queue.length)
          w.tx = tail.x
          w.tz = tail.z
          if (this.moveToward(w, dt)) {
            dumpster.queue.push(w.id)
            w.state = 'waiting'
          }
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
          amount: stats.truckCargo(this.trucks[0]?.load ?? 0) * 2,
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

  // Builds the route: out of the yard by the OUT gate if it's inside, along
  // the roads, and in by the IN gate to the bay (and on to a parking bay).
  private driveTo(truck: Truck, dest: Truck['dest']) {
    const path: Point[] = []
    let from: RoadSpot | null = truck.inYard ? null : truck.at
    if (truck.inYard) {
      if (dest.kind === 'plot') {
        path.push(...yardExitPath({ x: truck.x, z: truck.z }))
        from = YARD_GATE_OUT
      } else if (dest.kind === 'park') {
        if (truck.inYard === 'bay') path.push(...parkPath(truck.id))
      } else {
        path.push(YARD_BAY)
      }
    }
    if (from) {
      if (dest.kind === 'plot') path.push(...planRoute(from, plotStop(dest.plot)))
      else {
        path.push(...planRoute(from, YARD_GATE_IN), ...yardEnterPath())
        if (dest.kind === 'park') path.push(...parkPath(truck.id))
      }
    }
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
            this.pay(truck.cargo, truck.cargoValue * (1 + stats.priceBonus(this.upgrades)))
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
    for (const other of this.trucks) {
      if (other === truck) continue
      const dx = other.x - truck.x
      const dz = other.z - truck.z
      const ahead = dx * fx + dz * fz
      const side = Math.abs(dx * fz - dz * fx)
      if (ahead > 0 && ahead < 2.6 && side < 0.4) return
    }

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
      truck.timer = stats.unloadSeconds(this.upgrades)
    } else {
      truck.inYard = 'parked'
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
        })),
        trucks: this.trucks.map((t) => ({ id: t.id, load: t.load, speed: t.speed, cargo: t.cargo, state: t.state })),
        crewAuto: this.crewPlan === null,
        incomePerMinute: Math.round((earned / span) * 60),
        offlineEarnings: this.offlineEarnings,
        sitesCleared: this.sitesCleared,
        boostLeft: Math.max(0, Math.ceil(this.boostUntil - this.time)),
        notice: this.notices[0] ?? null,
        catchUp: this.catchUpLeft > 0 && this.catchUpTotal > 0 ? 1 - this.catchUpLeft / this.catchUpTotal : null,
        shortId: this.shortId,
        username: this.username,
        synced: this.synced,
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
