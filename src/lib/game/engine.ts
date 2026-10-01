import { getBlueprintSize, getBricks, type Brick, type BrickColor } from './blueprints'
import { BUILDINGS, brickCount, getBuilding, levelForXp, type BuildingDef } from './buildings'
import { PLOT_SLOTS } from './plots'
import { parkingSpot, planRoute, plotStop, routeLength, YARD_STOP, type Point, type RoadSpot } from './roads'

// The whole game simulation lives here, outside React: workers walking and
// carrying, rubble on the ground, the dumpsters and trucks, and the economy.
// Each plot you own is a Site with its own building, rubble, dumpster and
// truck run; the crew is one shared pool split across the plots. Positions
// inside a site are local to that plot's block (see plots.ts).
// The 3D scene advances it once per frame and draws whatever it says; the
// HUD subscribes to a throttled snapshot. Keeping it framework-free also
// means the same logic can be ported to the native app later.

import { BRICK, DUMPSTER, LOT_HALF } from './layout'
export { BRICK, DUMPSTER, LOT_HALF, ROAD_Z, TRUCK_STOP } from './layout'

const SAVE_KEY = 'rubble-save-v5'
const LEGACY_SAVE_KEY = 'rubble-save-v4'
const MAX_OFFLINE_SECONDS = 8 * 60 * 60
const LOAD_SECONDS = 0.8
const BREAK_FALL_SECONDS = 0.7
export const BREAK_COOLDOWN_SECONDS = 0.5

// Bonus drop: every few minutes a trailer passes on the front road and
// spills bricks on the sidewalk; watching an ad tips them straight into the
// dumpster (ignoring its limit), otherwise they're swept away.
export const BONUS_LIFETIME_SECONDS = 30
export const TRAILER_SECONDS = 7
export const TRAILER_FAR = 34
export const BONUS_SPOT = { x: 5.5, z: LOT_HALF + 0.7 }
const TRAILER_DROP_AT = (TRAILER_FAR - BONUS_SPOT.x) / (TRAILER_FAR * 2)
const nextBonusDelay = () => 180 + Math.random() * 120

// Site-wide upgrades. Each truck also has its own load/speed levels.
export type Upgrades = {
  tools: number
  speed: number
  workers: number
  dumpster: number
  fleet: number
  yardSpeed: number
  yardBonus: number
}
export type UpgradeKey = keyof Upgrades

export const UPGRADE_INFO: Record<UpgradeKey, { label: string; base: number; growth: number }> = {
  tools: { label: 'Better tools', base: 15, growth: 1.5 },
  speed: { label: 'Walking speed', base: 25, growth: 1.45 },
  workers: { label: 'Hire worker', base: 40, growth: 1.7 },
  dumpster: { label: 'Bigger dumpster', base: 30, growth: 1.5 },
  fleet: { label: 'Buy a truck', base: 300, growth: 2.6 },
  yardSpeed: { label: 'Faster unloading', base: 60, growth: 1.55 },
  yardBonus: { label: 'Better prices', base: 120, growth: 1.7 },
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
  dumpsterCapacity: (u: Upgrades) => 8 + 6 * u.dumpster,
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
  at: RoadSpot // the stop it last set off from / is at
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
  dumpsterLoad: number
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
  dumpsterCapacity: number
  incomePerMinute: number
  offlineEarnings: number
  sitesCleared: number
  bonusDrop: { amount: number; secondsLeft: number } | null
}

type PlotSave = {
  phase: PlotPhase
  buildingId: string
  removed: string
  rubble: number
  dumpsterLoad: number
}

type SaveData = {
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
  upgrades: Partial<Upgrades> & { hammer?: number; truck?: number }
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
  private nextRubbleId = 1
  dumpsterLoad = 0
  // Drained by this plot's Building renderer.
  events: EngineEvent[] = []

  constructor(readonly id: number) {}

  loadBuilding(def: BuildingDef, removed?: Uint8Array) {
    this.building = def
    this.bricks = getBricks(def.blueprint)
    this.removed = removed ?? new Uint8Array(this.bricks.length)
    this.claimed = new Uint8Array(this.bricks.length)
    const [w, , d] = getBlueprintSize(def.blueprint)
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
  upgrades: Upgrades = { tools: 0, speed: 0, workers: 0, dumpster: 0, fleet: 0, yardSpeed: 0, yardBonus: 0 }
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
      z: spot.line - 0.6,
      heading: Math.PI / 2,
      path: [],
      dest: { kind: 'park' },
      at: spot,
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
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────

  load() {
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
    const { truck: oldTruckLevel, ...upgrades } = save.upgrades as Upgrades & { truck?: number }
    this.upgrades = { ...this.upgrades, ...upgrades }
    this.sitesCleared = save.sitesCleared ?? 0
    this.crewPlan = save.crewPlan ?? null
    this.trucks = (save.trucks ?? [{ load: oldTruckLevel ?? 0, speed: 0 }]).map((t, id) => this.newTruck(id, t))
    this.plots = save.plots.slice(0, PLOT_SLOTS.length).map((ps, id) => {
      const site = new Site(id)
      site.phase = ps.phase
      site.dumpsterLoad = ps.dumpsterLoad
      const def = getBuilding(ps.buildingId)
      if (ps.phase === 'empty') {
        site.building = def
      } else {
        site.loadBuilding(def, decodeBits(ps.removed, brickCount(def)))
        for (let i = 0; i < ps.rubble; i++) site.spawnRubble(site.bricks[0]?.color ?? 'brick', 0)
      }
      return site
    })
    this.syncWorkers()

    const away = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (Date.now() - save.lastSeen) / 1000))
    this.offlineEarnings = this.catchUp(away)
  }

  save() {
    const data: SaveData = {
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
        dumpsterLoad: p.dumpsterLoad,
      })),
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    } catch {
      // storage full / private mode — the game still runs, just won't persist
    }
  }

  // Time away is simulated as a steady pipeline per plot: whichever is
  // slower — that plot's crew walking bricks to the dumpster or its truck
  // hauling them — sets the rate, capped by how many bricks are left.
  catchUp(seconds: number): number {
    if (seconds < 5) return 0
    const u = this.upgrades
    const before = this.scrap
    let any = false
    for (const site of this.plots) {
      if (site.phase !== 'demolishing') continue
      const crew = this.workers.filter((w) => w.plot === site.id).length
      if (crew === 0) continue
      const avgWalk = LOT_HALF * 0.8
      const carry = stats.carry(u)
      const workerTrip = (avgWalk * 2) / stats.walkSpeed(u) + stats.pullSeconds(u) * carry
      const workerRate = (crew * carry) / workerTrip
      // The fleet's hauling rate (bricks/second over a whole lap), shared
      // between every plot being demolished.
      const active = this.plots.filter((p) => p.phase === 'demolishing').length
      const truckRate = this.fleetRate() / Math.max(1, active)
      const available = site.bricksLeft + site.rubble.length + site.dumpsterLoad
      let hauled = Math.min(Math.floor(Math.min(workerRate, truckRate) * seconds), available)
      const total = hauled
      if (total <= 0) continue
      any = true

      const fromDumpster = Math.min(hauled, site.dumpsterLoad)
      site.dumpsterLoad -= fromDumpster
      hauled -= fromDumpster
      const fromRubble = Math.min(hauled, site.rubble.length)
      site.rubble.splice(0, fromRubble)
      hauled -= fromRubble
      while (hauled > 0) {
        const i = site.pickTopBrick(null)
        if (i < 0) break
        site.removeBrick(i)
        hauled--
      }
      this.pay(total, total * site.building.brickValue * (1 + stats.priceBonus(u)))
      this.checkCleared(site)
      site.events.push({ type: 'resync' })
    }
    if (any) this.markDirty()
    return Math.round(this.scrap - before)
  }

  // ── Player actions ────────────────────────────────────────────────────

  private lastBreakAt = -Infinity

  // Enforced here rather than only in the button so auto-clickers or rapid
  // taps can't bypass it.
  breakCooldownLeft(): number {
    return Math.max(0, BREAK_COOLDOWN_SECONDS - (performance.now() - this.lastBreakAt) / 1000)
  }

  breakTap(plot: number) {
    const site = this.plots[plot]
    if (!site || site.phase !== 'demolishing' || this.breakCooldownLeft() > 0) return 0
    this.lastBreakAt = performance.now()
    let broke = 0
    for (let n = 0; n < stats.bricksPerTap(); n++) {
      const i = site.pickTopBrick(null)
      if (i < 0) break
      const pos = site.brickWorld(i)
      site.removeBrick(i)
      const r = site.spawnRubble(site.bricks[i].color, this.time + BREAK_FALL_SECONDS, pos)
      site.events.push({ type: 'brickBroken', index: i, toX: r.x, toZ: r.z })
      site.events.push({ type: 'rubbleSpawned', id: r.id })
      broke++
    }
    if (broke) this.markDirty()
    return broke
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
    const stops = [YARD_STOP, ...this.plots.map((p) => plotStop(p.id)), YARD_STOP]
    let length = 0
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
    const step = stats.walkSpeed(this.upgrades) * dt
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
    const capacity = stats.dumpsterCapacity(u)

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
            w.timer = stats.pullSeconds(u)
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
              // Drop-off spot behind the dumpster, clear of even the biggest
              // (compactor) version of it.
              w.tx = DUMPSTER.x + ((w.id % 5) - 2) * 0.4
              w.tz = DUMPSTER.z - 1.3
            } else {
              w.state = 'idle'
            }
          }
          break
        case 'toDumpster':
          if (this.moveToward(w, dt)) w.state = 'waiting'
          break
        case 'waiting':
          w.heading = Math.atan2(DUMPSTER.x - w.x, DUMPSTER.z - w.z)
          if (site.dumpsterLoad < capacity && !this.loadingAt(site)) {
            const n = Math.min(w.held, capacity - site.dumpsterLoad)
            site.dumpsterLoad += n
            w.held -= n
            if (w.held === 0) {
              w.carrying = null
              w.state = 'idle'
            }
            this.markDirty()
          }
          break
      }
    }

    this.tickTrucks(dt)
    for (const site of this.plots) this.checkCleared(site)

    this.tickBonus(dt)
    this.recentHauls = this.recentHauls.filter((h) => this.time - h.t < 60)

    if (this.dirty && this.time - this.lastFlush > 0.12) this.flush()
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
    this.home.dumpsterLoad += this.bonusDrop.amount
    this.lastBonusClaim = { at: this.time, amount: this.bonusDrop.amount }
    this.bonusDrop = null
    this.bonusHeld = false
    this.markDirty()
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

  private driveTo(truck: Truck, dest: Truck['dest'], spot: RoadSpot) {
    truck.path = planRoute(truck.at, spot)
    truck.dest = dest
    truck.at = spot
    truck.state = 'driving'
  }

  // Where to next: unload if full; else the next plot this lap with
  // anything in its dumpster; else unload whatever's aboard to end the
  // lap; else park at the yard until there's something to collect.
  private nextStop(truck: Truck) {
    if (truck.cargo >= stats.truckCargo(truck.load)) return this.driveTo(truck, { kind: 'yard' }, YARD_STOP)
    for (let i = truck.lap; i < this.plots.length; i++) {
      if (this.plots[i].dumpsterLoad > 0) {
        truck.lap = i + 1
        return this.driveTo(truck, { kind: 'plot', plot: i }, plotStop(i))
      }
    }
    truck.lap = this.plots.length
    if (truck.cargo > 0) return this.driveTo(truck, { kind: 'yard' }, YARD_STOP)
    truck.lap = 0
    this.driveTo(truck, { kind: 'park' }, parkingSpot(truck.id))
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
            const n = Math.min(site.dumpsterLoad, stats.truckCargo(truck.load) - truck.cargo)
            site.dumpsterLoad -= n
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
      truck.state = 'loading'
      truck.timer = LOAD_SECONDS
    } else if (truck.dest.kind === 'yard') {
      truck.state = 'unloading'
      truck.timer = stats.unloadSeconds(this.upgrades)
    } else {
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
          truckState: this.truckAt(p)?.state ?? 'away',
          crew: crew[p.id],
        })),
        trucks: this.trucks.map((t) => ({ id: t.id, load: t.load, speed: t.speed, cargo: t.cargo, state: t.state })),
        crewAuto: this.crewPlan === null,
        dumpsterCapacity: stats.dumpsterCapacity(this.upgrades),
        incomePerMinute: Math.round((earned / span) * 60),
        offlineEarnings: this.offlineEarnings,
        sitesCleared: this.sitesCleared,
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
      dumpster: u.dumpster ?? u.truck ?? 0,
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
        dumpsterLoad: old.dumpsterLoad,
      },
    ],
  }
}

let instance: Engine | null = null

export function getEngine(): Engine {
  if (!instance) {
    instance = new Engine()
    instance.load()
    // Handy for poking at the simulation from the console during development.
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __rubble: Engine }).__rubble = instance
  }
  return instance
}
