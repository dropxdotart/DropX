import { getBlueprintSize, getBricks, type Brick, type BrickColor } from './blueprints'
import { BUILDINGS, brickCount, getBuilding, levelForXp, type BuildingDef } from './buildings'

// The whole game simulation lives here, outside React: workers walking and
// carrying, rubble on the ground, the dumpster and truck, and the economy.
// The 3D scene advances it once per frame and draws whatever it says; the
// HUD subscribes to a throttled snapshot. Keeping it framework-free also
// means the same logic can be ported to the native app later.

export const BRICK = 0.33
export const LOT_HALF = 8
export const ROAD_Z = LOT_HALF + 3.5
export const DUMPSTER = { x: 0, z: LOT_HALF - 1.4 }
export const TRUCK_STOP = { x: 0, z: ROAD_Z - 0.6 }

const SAVE_KEY = 'rubble-save-v4'
const MAX_OFFLINE_SECONDS = 8 * 60 * 60
const LOAD_SECONDS = 0.8
const BREAK_FALL_SECONDS = 0.7

export type Upgrades = { hammer: number; speed: number; workers: number; truck: number }
export type UpgradeKey = keyof Upgrades

export const UPGRADE_INFO: Record<UpgradeKey, { label: string; base: number; growth: number }> = {
  hammer: { label: 'Hammer', base: 15, growth: 1.5 },
  speed: { label: 'Worker speed', base: 25, growth: 1.45 },
  workers: { label: 'Hire worker', base: 40, growth: 1.7 },
  truck: { label: 'Truck', base: 30, growth: 1.5 },
}

export function upgradeCost(key: UpgradeKey, level: number): number {
  const info = UPGRADE_INFO[key]
  return Math.round(info.base * Math.pow(info.growth, level))
}

export const stats = {
  bricksPerTap: (u: Upgrades) => 1 + u.hammer,
  walkSpeed: (u: Upgrades) => 2 * (1 + 0.15 * u.speed),
  pullSeconds: (u: Upgrades) => 0.6 / (1 + 0.15 * u.speed),
  workerCount: (u: Upgrades) => 1 + u.workers,
  truckCapacity: (u: Upgrades) => 8 + 6 * u.truck,
  truckTripSeconds: (u: Upgrades) => Math.max(3, 8 * Math.pow(0.9, u.truck)),
}

export type WorkerState = 'idle' | 'toPick' | 'picking' | 'toDumpster' | 'waiting'

export type Worker = {
  id: number
  x: number
  z: number
  heading: number
  state: WorkerState
  tx: number
  tz: number
  target: { kind: 'brick'; index: number } | { kind: 'rubble'; id: number } | null
  timer: number
  carrying: BrickColor | null
}

export type Rubble = { id: number; x: number; z: number; color: BrickColor; claimed: boolean; readyAt: number }

export type TruckState = 'away' | 'arriving' | 'loading' | 'leaving'

export type EngineEvent =
  | { type: 'siteStarted' }
  | { type: 'resync' }
  | { type: 'brickBroken'; index: number; toX: number; toZ: number }
  | { type: 'brickPulled'; index: number; workerId: number }
  | { type: 'rubbleSpawned'; id: number }
  | { type: 'rubblePicked'; id: number }

export type Snapshot = {
  scrap: number
  xp: number
  level: number
  upgrades: Upgrades
  buildingId: string
  bricksTotal: number
  bricksLeft: number
  rubbleLeft: number
  dumpsterLoad: number
  truckCapacity: number
  truckState: TruckState
  phase: 'demolishing' | 'picking'
  incomePerMinute: number
  offlineEarnings: number
  sitesCleared: number
}

type SaveData = {
  scrap: number
  xp: number
  upgrades: Upgrades
  buildingId: string
  phase: 'demolishing' | 'picking'
  removed: string
  rubble: number
  dumpsterLoad: number
  sitesCleared: number
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

export class Engine {
  time = 0
  scrap = 0
  xp = 0
  upgrades: Upgrades = { hammer: 0, speed: 0, workers: 0, truck: 0 }
  sitesCleared = 0
  phase: 'demolishing' | 'picking' = 'demolishing'
  offlineEarnings = 0

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

  workers: Worker[] = []
  rubble: Rubble[] = []
  private nextRubbleId = 1
  dumpsterLoad = 0
  truckState: TruckState = 'away'
  truckTimer = 0
  private recentHauls: { t: number; value: number }[] = []

  events: EngineEvent[] = []
  private listeners = new Set<() => void>()
  private dirty = true
  private lastFlush = 0
  private snapshot: Snapshot | null = null

  // ── Setup ─────────────────────────────────────────────────────────────

  loadSite(def: BuildingDef, removed?: Uint8Array) {
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
    this.markDirty()
  }

  private syncWorkers() {
    const want = stats.workerCount(this.upgrades)
    while (this.workers.length < want) {
      const id = this.workers.length
      this.workers.push({
        id,
        x: DUMPSTER.x + (id % 5) * 0.5 - 1,
        z: DUMPSTER.z - 0.6,
        heading: Math.PI,
        state: 'idle',
        tx: 0,
        tz: 0,
        target: null,
        timer: 0,
        carrying: null,
      })
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────

  load() {
    let save: SaveData | null = null
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (raw) save = JSON.parse(raw) as SaveData
    } catch {
      save = null
    }

    if (!save) {
      this.loadSite(BUILDINGS[0])
      this.syncWorkers()
      return
    }

    this.scrap = save.scrap
    this.xp = save.xp
    this.upgrades = { ...this.upgrades, ...save.upgrades }
    this.sitesCleared = save.sitesCleared ?? 0
    this.phase = save.phase
    this.dumpsterLoad = save.dumpsterLoad
    const def = getBuilding(save.buildingId)
    this.loadSite(def, decodeBits(save.removed, brickCount(def)))
    for (let i = 0; i < save.rubble; i++) this.spawnRubbleNearSite(this.bricks[0]?.color ?? 'brick', 0)
    this.syncWorkers()

    const away = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (Date.now() - save.lastSeen) / 1000))
    this.offlineEarnings = this.catchUp(away)
  }

  save() {
    const data: SaveData = {
      scrap: this.scrap,
      xp: this.xp,
      upgrades: this.upgrades,
      buildingId: this.building.id,
      phase: this.phase,
      removed: encodeBits(this.removed),
      // Carried bricks go back on the ground on reload rather than vanishing.
      rubble: this.rubble.length + this.workers.filter((w) => w.carrying).length,
      dumpsterLoad: this.dumpsterLoad,
      sitesCleared: this.sitesCleared,
      lastSeen: Date.now(),
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    } catch {
      // storage full / private mode — the game still runs, just won't persist
    }
  }

  // Time away is simulated as a steady pipeline: whichever is slower — the
  // crew walking bricks to the dumpster or the truck hauling them — sets the
  // rate, capped by how many bricks the site has left.
  catchUp(seconds: number): number {
    if (seconds < 5 || this.phase !== 'demolishing') return 0
    const u = this.upgrades
    const avgWalk = LOT_HALF * 0.8
    const workerTrip = (avgWalk * 2) / stats.walkSpeed(u) + stats.pullSeconds(u)
    const workerRate = stats.workerCount(u) / workerTrip
    const truckRate = stats.truckCapacity(u) / (stats.truckTripSeconds(u) + LOAD_SECONDS)
    const available = this.bricksLeft + this.rubble.length + this.dumpsterLoad
    let hauled = Math.min(Math.floor(Math.min(workerRate, truckRate) * seconds), available)
    const total = hauled
    if (total <= 0) return 0

    const fromDumpster = Math.min(hauled, this.dumpsterLoad)
    this.dumpsterLoad -= fromDumpster
    hauled -= fromDumpster
    const fromRubble = Math.min(hauled, this.rubble.length)
    this.rubble.splice(0, fromRubble)
    hauled -= fromRubble
    while (hauled > 0) {
      const i = this.pickTopBrick(null)
      if (i < 0) break
      this.removeBrick(i)
      hauled--
    }

    const before = this.scrap
    this.pay(total)
    this.checkCleared()
    this.events.push({ type: 'resync' })
    return Math.round(this.scrap - before)
  }

  // ── Bricks & rubble ───────────────────────────────────────────────────

  brickWorld(i: number) {
    const b = this.bricks[i]
    return { x: b.x * BRICK, y: b.y * BRICK + BRICK / 2, z: b.z * BRICK }
  }

  private removeBrick(i: number) {
    this.removed[i] = 1
    this.claimed[i] = 0
    this.bricksLeft--
    const c = this.brickColumn[i]
    let t = this.columnTop[c]
    while (t >= 0 && this.removed[this.columns[c][t]]) t--
    this.columnTop[c] = t
    this.markDirty()
  }

  // The best unclaimed top-of-column brick: nearest to `near` (a worker's
  // preferred spot) if given, otherwise the highest one (taps take the roof
  // off first, which reads as demolition rather than random damage).
  private pickTopBrick(near: { x: number; z: number } | null): number {
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

  private spawnRubbleNearSite(color: BrickColor, readyAt: number, from?: { x: number; z: number }) {
    const angle = from ? Math.atan2(from.z, from.x) + (Math.random() - 0.5) * 0.8 : Math.random() * Math.PI * 2
    const reach = Math.max(this.halfX, this.halfZ) + 0.4 + Math.random() * 1.6
    const limit = LOT_HALF - 0.6
    const x = Math.max(-limit, Math.min(limit, Math.cos(angle) * reach))
    const z = Math.max(-limit, Math.min(DUMPSTER.z - 1.2, Math.sin(angle) * reach))
    const r: Rubble = { id: this.nextRubbleId++, x, z, color, claimed: false, readyAt }
    this.rubble.push(r)
    return r
  }

  // ── Player actions ────────────────────────────────────────────────────

  breakTap() {
    if (this.phase !== 'demolishing') return 0
    let broke = 0
    for (let n = 0; n < stats.bricksPerTap(this.upgrades); n++) {
      const i = this.pickTopBrick(null)
      if (i < 0) break
      const pos = this.brickWorld(i)
      this.removeBrick(i)
      const r = this.spawnRubbleNearSite(this.bricks[i].color, this.time + BREAK_FALL_SECONDS, pos)
      this.events.push({ type: 'brickBroken', index: i, toX: r.x, toZ: r.z })
      this.events.push({ type: 'rubbleSpawned', id: r.id })
      broke++
    }
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

  startBuilding(id: string): string | null {
    const def = getBuilding(id)
    if (levelForXp(this.xp) < def.requiredLevel) return `Reach level ${def.requiredLevel} first`
    if (this.scrap < def.contractCost) return 'Not enough scrap for this contract'
    this.scrap -= def.contractCost
    this.phase = 'demolishing'
    this.rubble = []
    this.dumpsterLoad = 0
    for (const w of this.workers) {
      w.state = 'idle'
      w.target = null
      w.carrying = null
    }
    this.loadSite(def)
    this.save()
    return null
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

  private pay(bricks: number) {
    const value = bricks * this.building.brickValue
    this.scrap += value
    this.xp += bricks
    this.recentHauls.push({ t: this.time, value })
    this.markDirty()
  }

  private siteEmpty() {
    return this.bricksLeft === 0 && this.rubble.length === 0 && !this.workers.some((w) => w.carrying)
  }

  private checkCleared() {
    if (this.phase === 'demolishing' && this.siteEmpty() && this.dumpsterLoad === 0 && this.truckState !== 'loading') {
      this.phase = 'picking'
      this.sitesCleared++
      this.scrap += this.building.bonus
      this.save()
      this.markDirty()
    }
  }

  // A preferred spot around the building for each worker (golden-angle
  // spread) so the crew fans out instead of all queueing at one wall.
  private homeSpot(w: Worker) {
    const a = w.id * 2.39996
    return { x: Math.cos(a) * (this.halfX + 2), z: Math.sin(a) * (this.halfZ + 2) }
  }

  // Where a worker stands to pull a given brick: just outside the footprint
  // on the side nearest that brick.
  private standSpot(bx: number, bz: number) {
    const m = 0.45
    const nx = bx / Math.max(this.halfX, 0.01)
    const nz = bz / Math.max(this.halfZ, 0.01)
    if (Math.abs(nx) > Math.abs(nz)) return { x: Math.sign(bx || 1) * (this.halfX + m), z: bz }
    return { x: bx, z: Math.sign(bz || 1) * (this.halfZ + m) }
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

  private assignTarget(w: Worker) {
    let bestRubble: Rubble | null = null
    let bestDist = Infinity
    for (const r of this.rubble) {
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

    const i = this.pickTopBrick(this.homeSpot(w))
    if (i >= 0) {
      this.claimed[i] = 1
      const b = this.bricks[i]
      const spot = this.standSpot(b.x * BRICK, b.z * BRICK)
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
    const capacity = stats.truckCapacity(u)

    for (const w of this.workers) {
      switch (w.state) {
        case 'idle':
          if (this.phase === 'demolishing') this.assignTarget(w)
          break
        case 'toPick':
          if (this.moveToward(w, dt)) {
            w.state = 'picking'
            w.timer = stats.pullSeconds(u)
            const t = w.target
            if (t?.kind === 'brick') {
              const b = this.bricks[t.index]
              w.heading = Math.atan2(b.x * BRICK - w.x, b.z * BRICK - w.z)
            }
          }
          break
        case 'picking':
          w.timer -= dt
          if (w.timer <= 0) {
            const t = w.target
            if (t?.kind === 'brick') {
              w.carrying = this.bricks[t.index].color
              this.removeBrick(t.index)
              this.events.push({ type: 'brickPulled', index: t.index, workerId: w.id })
            } else if (t?.kind === 'rubble') {
              const idx = this.rubble.findIndex((r) => r.id === t.id)
              if (idx >= 0) {
                w.carrying = this.rubble[idx].color
                this.rubble.splice(idx, 1)
                this.events.push({ type: 'rubblePicked', id: t.id })
              }
            }
            w.target = null
            if (w.carrying) {
              w.state = 'toDumpster'
              w.tx = DUMPSTER.x + ((w.id % 5) - 2) * 0.35
              w.tz = DUMPSTER.z - 0.7
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
          if (this.dumpsterLoad < capacity && this.truckState !== 'loading') {
            this.dumpsterLoad++
            w.carrying = null
            w.state = 'idle'
            this.markDirty()
          }
          break
      }
    }

    // Truck: comes when the dumpster is full (or when the site's done and
    // there's anything left in it), loads, and pays out as it drives off.
    const trip = stats.truckTripSeconds(u)
    switch (this.truckState) {
      case 'away':
        if (this.dumpsterLoad >= capacity || (this.dumpsterLoad > 0 && this.siteEmpty())) {
          this.truckState = 'arriving'
          this.truckTimer = trip / 2
          this.markDirty()
        }
        break
      case 'arriving':
        this.truckTimer -= dt
        if (this.truckTimer <= 0) {
          this.truckState = 'loading'
          this.truckTimer = LOAD_SECONDS
          this.markDirty()
        }
        break
      case 'loading':
        this.truckTimer -= dt
        if (this.truckTimer <= 0) {
          const cargo = this.dumpsterLoad
          this.dumpsterLoad = 0
          this.pay(cargo)
          this.truckState = 'leaving'
          this.truckTimer = trip / 2
        }
        break
      case 'leaving':
        this.truckTimer -= dt
        if (this.truckTimer <= 0) {
          this.truckState = 'away'
          this.markDirty()
        }
        break
    }

    this.checkCleared()
    this.recentHauls = this.recentHauls.filter((h) => this.time - h.t < 60)

    if (this.dirty && this.time - this.lastFlush > 0.12) this.flush()
  }

  truckProgress(): number {
    const half = stats.truckTripSeconds(this.upgrades) / 2
    if (this.truckState === 'arriving') return 1 - this.truckTimer / half
    if (this.truckState === 'leaving') return this.truckTimer / half
    return this.truckState === 'loading' ? 1 : 0
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
      this.snapshot = {
        scrap: this.scrap,
        xp: this.xp,
        level: levelForXp(this.xp),
        upgrades: this.upgrades,
        buildingId: this.building.id,
        bricksTotal: this.bricks.length,
        bricksLeft: this.bricksLeft,
        rubbleLeft: this.rubble.length,
        dumpsterLoad: this.dumpsterLoad,
        truckCapacity: stats.truckCapacity(this.upgrades),
        truckState: this.truckState,
        phase: this.phase,
        incomePerMinute: Math.round((earned / span) * 60),
        offlineEarnings: this.offlineEarnings,
        sitesCleared: this.sitesCleared,
      }
    }
    return this.snapshot
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
