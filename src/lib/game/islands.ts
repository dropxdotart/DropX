// The world is a chain of islands on one shared grid of blocks. Each island
// is a set of blocks that grows in stages: you start on a small bit of the
// Houses island and expand it (new land rises from the sea); once it's
// fully grown you can bridge over to the City, which also starts small and
// grows, and so on.
//
// Block (i, j) is centred on world (i·BLOCK, j·BLOCK). Roads run along the
// block edges — every block is ringed by streets — so a block's front road
// (+z) is at z = j·BLOCK + R and its right road (+x) at x = i·BLOCK + R.

export const BLOCK = 23
const R = 11.5 // ROAD_Z: a block's centre to the road in front of it (= BLOCK / 2)

export type IslandId = 'houses' | 'city' | 'industrial'
export type YardTheme = 'timber' | 'brick' | 'smelter'
export type FillerKind = 'suburb' | 'park' | 'shops' | 'downtown' | 'industrial' | 'quay'

// What a block is: a plot (bought in order), the island's yard, or filler.
export type CellWhat = 'plot' | 'harbour' | 'yard' | FillerKind
export type Cell = { i: number; j: number; stage: number; what: CellWhat }

// Growing an island to a stage: unlock level, price and build time. Stage 0
// of every island but the first is reached by building a bridge to it.
export type Stage = { level: number; cost: number; buildMinutes: number }

export type Island = {
  id: IslandId
  index: number
  name: string
  emoji: string
  cells: Cell[]
  // stages[0] is null for the island you start on (it's simply there).
  stages: (Stage | null)[]
  // The island's yard. A 'shore' yard grows back (−z) over the water onto a
  // pier — the block behind it is always sea; an 'inland' one stays within
  // its block.
  yard: { x: number; z: number; theme: YardTheme; name: string; setting: 'shore' | 'inland'; maxSize: number }
}

// Shorthand for the layouts below: [i, j, what] per stage.
type Row = [number, number, CellWhat]
function cells(stages: Row[][]): Cell[] {
  return stages.flatMap((rows, stage) => rows.map(([i, j, what]) => ({ i, j, stage, what })))
}

export const ISLANDS: Island[] = [
  {
    id: 'houses',
    index: 0,
    name: 'Houses island',
    emoji: '🏡',
    // A plus: home lot, a second plot, the yard and a couple of streets of
    // houses → a 3×3 town → a wide island with a point facing the City.
    // The yard never borders a plot.
    cells: cells([
      [
        [0, 6, 'plot'],
        [-1, 6, 'plot'],
        [0, 5, 'suburb'],
        [1, 5, 'yard'],
        [0, 7, 'shops'],
      ],
      [
        [-1, 5, 'plot'],
        [-1, 7, 'plot'],
        [1, 6, 'park'],
        [-2, 6, 'suburb'],
        [1, 7, 'suburb'],
      ],
      [
        [2, 7, 'plot'],
        [-2, 5, 'plot'],
        [2, 6, 'suburb'],
        [2, 5, 'suburb'],
        [-2, 7, 'park'],
        [0, 4, 'suburb'],
      ],
    ]),
    stages: [null, { level: 3, cost: 600, buildMinutes: 2 }, { level: 6, cost: 6_000, buildMinutes: 5 }],
    yard: { x: BLOCK, z: 5 * BLOCK, theme: 'timber', name: 'Timber & Recycling Yard', setting: 'inland', maxSize: 3 },
  },
  {
    id: 'city',
    index: 1,
    name: 'City',
    emoji: '🏙️',
    // The yard sits on an inlet (block (1, 0) stays sea) so it can grow
    // out over the water, with downtown all round it. The last stage is
    // the harbour quay.
    cells: cells([
      [
        [-1, 2, 'plot'],
        [-1, 1, 'plot'],
        [1, 1, 'yard'],
        [0, 1, 'downtown'],
        [0, 2, 'downtown'],
        [1, 2, 'shops'],
      ],
      [
        [0, 0, 'plot'],
        [-2, 1, 'plot'],
        [-1, 0, 'downtown'],
        [2, 2, 'downtown'],
        [2, 1, 'park'],
        [-2, 2, 'downtown'],
      ],
      [
        [0, -1, 'plot'],
        [-1, -1, 'plot'],
        [-2, 0, 'park'],
        [2, 0, 'downtown'],
      ],
      [
        [3, 1, 'harbour'],
        [3, 2, 'harbour'],
        [3, 0, 'quay'],
      ],
    ]),
    stages: [
      { level: 8, cost: 50_000, buildMinutes: 10 },
      { level: 10, cost: 150_000, buildMinutes: 15 },
      { level: 12, cost: 600_000, buildMinutes: 20 },
      { level: 14, cost: 2_500_000, buildMinutes: 30 },
    ],
    yard: { x: BLOCK, z: BLOCK, theme: 'brick', name: 'Brick & Concrete Yard', setting: 'shore', maxSize: 10 },
  },
  {
    id: 'industrial',
    index: 2,
    name: 'Industrial island',
    emoji: '🏭',
    // Block (−4, −1) stays sea for the smelter's pier.
    cells: cells([
      [
        [-5, 1, 'plot'],
        [-4, 2, 'plot'],
        [-4, 0, 'yard'],
        [-4, 1, 'industrial'],
        [-5, 0, 'industrial'],
      ],
      [
        [-6, 1, 'plot'],
        [-6, 0, 'plot'],
        [-5, 2, 'industrial'],
        [-6, 2, 'industrial'],
        [-5, -1, 'industrial'],
      ],
      [
        [-7, 1, 'plot'],
        [-4, 3, 'plot'],
        [-7, 0, 'industrial'],
        [-6, -1, 'industrial'],
        [-5, 3, 'industrial'],
        [-7, 2, 'industrial'],
      ],
    ]),
    stages: [
      { level: 16, cost: 4_000_000, buildMinutes: 60 },
      { level: 18, cost: 10_000_000, buildMinutes: 45 },
      { level: 20, cost: 25_000_000, buildMinutes: 60 },
    ],
    yard: { x: -4 * BLOCK, z: 0, theme: 'smelter', name: 'Steel Smelter', setting: 'shore', maxSize: 10 },
  },
]

// No plot may border its island's yard (side by side) — checked here so a
// layout edit can't slip one in.
for (const s of ISLANDS) {
  const y = s.cells.find((c) => c.what === 'yard')!
  for (const c of s.cells)
    if ((c.what === 'plot' || c.what === 'harbour') && Math.abs(c.i - y.i) + Math.abs(c.j - y.j) === 1)
      throw new Error(`${s.id}: plot (${c.i}, ${c.j}) is right next to the yard`)
}

export function island(id: IslandId): Island {
  return ISLANDS.find((s) => s.id === id)!
}

export const lastStage = (s: Island) => s.stages.length - 1

// ── What's grown ─────────────────────────────────────────────────────────
//
// How far each island has grown: −1 = not reached yet, 0 = its first bit,
// up to lastStage. The engine sets this; roads and routing follow it.

export type Grown = Record<IslandId, number>
export const START_GROWN: Grown = { houses: 0, city: -1, industrial: -1 }

let grown: Grown = { ...START_GROWN }
let grownVersion = 0

export function setGrown(g: Grown) {
  if (ISLANDS.every((s) => g[s.id] === grown[s.id])) return
  grown = { ...g }
  grownVersion++
  graphCache = null
}

export function getGrown(): Grown {
  return grown
}

export const cellOpen = (s: Island, c: Cell, g: Grown = grown) => c.stage <= g[s.id]

// ── Bridges ──────────────────────────────────────────────────────────────

// Bridges between islands: the road they carry and the island they reach.
export type Bridge = { to: IslandId; axis: 'x' | 'z'; line: number; from: number; until: number }
export const BRIDGES: Bridge[] = [
  // Houses (its north point, block (0, 4)) → City (block (0, 2)), up x = R.
  { to: 'city', axis: 'x', line: R, from: 2 * BLOCK + R, until: 3 * BLOCK + R },
  // City (block (−2, 1)) → Industrial (block (−4, 1)), along z = BLOCK + R.
  { to: 'industrial', axis: 'z', line: BLOCK + R, from: -4 * BLOCK + R, until: -3 * BLOCK + R },
]

// ── Road network ─────────────────────────────────────────────────────────

// A straight road: along x at height `line` (z), or along z at `line` (x).
// Island roads are one block edge long, tagged with the stage that builds
// them; bridges carry `bridge`.
export type Segment = { axis: 'x' | 'z'; line: number; from: number; until: number; bridge?: IslandId; island?: IslandId; stage?: number }

function islandRoads(s: Island): Segment[] {
  const edges = new Map<string, Segment>()
  const add = (key: string, seg: Segment) => {
    const have = edges.get(key)
    if (!have || seg.stage! < have.stage!) edges.set(key, seg)
  }
  for (const c of s.cells) {
    const x = c.i * BLOCK
    const z = c.j * BLOCK
    add(`z${c.j * 2 + 1},${c.i}`, { axis: 'z', line: z + R, from: x - R, until: x + R, island: s.id, stage: c.stage })
    add(`z${c.j * 2 - 1},${c.i}`, { axis: 'z', line: z - R, from: x - R, until: x + R, island: s.id, stage: c.stage })
    add(`x${c.i * 2 + 1},${c.j}`, { axis: 'x', line: x + R, from: z - R, until: z + R, island: s.id, stage: c.stage })
    add(`x${c.i * 2 - 1},${c.j}`, { axis: 'x', line: x - R, from: z - R, until: z + R, island: s.id, stage: c.stage })
  }
  // No road behind a shore yard: that's where it grows out over the water.
  if (s.yard.setting === 'shore') edges.delete(`z${Math.round(s.yard.z / BLOCK) * 2 - 1},${Math.round(s.yard.x / BLOCK)}`)
  return [...edges.values()]
}

export const ROADS: Segment[] = [...ISLANDS.flatMap(islandRoads), ...BRIDGES.map((b) => ({ axis: b.axis, line: b.line, from: b.from, until: b.until, bridge: b.to }))]

// Is this road there (its island grown far enough / its bridge built)?
export function roadOpen(seg: Segment, g: Grown = grown): boolean {
  if (seg.bridge) return g[seg.bridge] >= 0
  return !!seg.island && (seg.stage ?? 0) <= g[seg.island]
}

export type Point = { x: number; z: number }

// Graph of road junctions: every crossing and every road end.
type Node = Point
const EPS = 0.01
const key = (p: Point) => `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`

function pointsOn(seg: Segment, roads: Segment[], extra: Point[] = []): Point[] {
  const pts: Point[] = []
  const at = (t: number): Point => (seg.axis === 'z' ? { x: t, z: seg.line } : { x: seg.line, z: t })
  pts.push(at(seg.from), at(seg.until))
  for (const o of roads) {
    if (o.axis === seg.axis) continue
    if (o.line < seg.from - EPS || o.line > seg.until + EPS) continue
    if (seg.line < o.from - EPS || seg.line > o.until + EPS) continue
    pts.push(at(o.line))
  }
  for (const p of extra) {
    const onLine = seg.axis === 'z' ? Math.abs(p.z - seg.line) < EPS : Math.abs(p.x - seg.line) < EPS
    const t = seg.axis === 'z' ? p.x : p.z
    if (onLine && t >= seg.from - EPS && t <= seg.until + EPS) pts.push(p)
  }
  const along = (p: Point) => (seg.axis === 'z' ? p.x : p.z)
  return pts.sort((a, b) => along(a) - along(b))
}

type Graph = Map<string, { p: Node; edges: { to: string; d: number }[] }>
let graphCache: { version: number; roads: Segment[] } | null = null

function openRoads(): Segment[] {
  if (!graphCache || graphCache.version !== grownVersion) graphCache = { version: grownVersion, roads: ROADS.filter((r) => roadOpen(r)) }
  return graphCache.roads
}

function buildGraph(extra: Point[]): Graph {
  const roads = openRoads()
  const g: Graph = new Map()
  const node = (p: Point) => {
    const k = key(p)
    if (!g.has(k)) g.set(k, { p, edges: [] })
    return k
  }
  for (const seg of roads) {
    const pts = pointsOn(seg, roads, extra)
    for (let n = 0; n + 1 < pts.length; n++) {
      const a = node(pts[n])
      const b = node(pts[n + 1])
      if (a === b) continue
      const d = Math.hypot(pts[n].x - pts[n + 1].x, pts[n].z - pts[n + 1].z)
      g.get(a)!.edges.push({ to: b, d })
      g.get(b)!.edges.push({ to: a, d })
    }
  }
  return g
}

// Shortest way along the open roads between two road points, as corners.
export function roadPath(from: Point, to: Point): Point[] {
  const g = buildGraph([from, to])
  const start = key(from)
  const goal = key(to)
  if (!g.has(start) || !g.has(goal)) return [from, to]
  const dist = new Map<string, number>([[start, 0]])
  const prev = new Map<string, string>()
  const open = new Set([start])
  while (open.size) {
    let cur = ''
    let best = Infinity
    for (const k of open) {
      const d = dist.get(k)!
      if (d < best) {
        best = d
        cur = k
      }
    }
    open.delete(cur)
    if (cur === goal) break
    for (const e of g.get(cur)!.edges) {
      const nd = best + e.d
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd)
        prev.set(e.to, cur)
        open.add(e.to)
      }
    }
  }
  if (!dist.has(goal)) return [from, to]
  const path: Point[] = []
  for (let k: string | undefined = goal; k; k = prev.get(k)) path.unshift(g.get(k)!.p)
  // Keep only the corners.
  return path.filter((p, n) => {
    if (n === 0 || n === path.length - 1) return true
    const a = path[n - 1]
    const c = path[n + 1]
    return !((Math.abs(a.x - p.x) < EPS && Math.abs(p.x - c.x) < EPS) || (Math.abs(a.z - p.z) < EPS && Math.abs(p.z - c.z) < EPS))
  })
}

// ── Where things are ─────────────────────────────────────────────────────

// Which island a world point is on (any stage), or null in the water.
export function islandAt(x: number, z: number): Island | null {
  const i = Math.round(x / BLOCK)
  const j = Math.round(z / BLOCK)
  return ISLANDS.find((s) => s.cells.some((c) => c.i === i && c.j === j)) ?? null
}

// The bounds of an island's land up to a stage (all of it by default).
export function islandRect(s: Island, stage = lastStage(s)) {
  const cs = s.cells.filter((c) => c.stage <= stage)
  const pad = R + 2.7
  return {
    x0: Math.min(...cs.map((c) => c.i)) * BLOCK - pad,
    x1: Math.max(...cs.map((c) => c.i)) * BLOCK + pad,
    z0: Math.min(...cs.map((c) => c.j)) * BLOCK - pad,
    z1: Math.max(...cs.map((c) => c.j)) * BLOCK + pad,
  }
}

// ── Coastlines ───────────────────────────────────────────────────────────
//
// An island's outline as smooth loops: the union of its blocks, pushed out
// by `margin` and with every corner rounded off by `radius` — so a plus of
// blocks becomes a soft, organic shape. Used for the grass (small margin,
// just past the outer roads), the beach and the shallows (wider, rounder).

export function coastline(cs: { i: number; j: number }[], margin: number, radius: number): Point[][] {
  const has = new Set(cs.map((c) => `${c.i},${c.j}`))
  const h = BLOCK / 2
  // Boundary edges, each with the land on its left (x right, z up).
  type E = { a: Point; b: Point }
  const edges: E[] = []
  for (const c of cs) {
    const x = c.i * BLOCK
    const z = c.j * BLOCK
    if (!has.has(`${c.i},${c.j - 1}`)) edges.push({ a: { x: x - h, z: z - h }, b: { x: x + h, z: z - h } })
    if (!has.has(`${c.i + 1},${c.j}`)) edges.push({ a: { x: x + h, z: z - h }, b: { x: x + h, z: z + h } })
    if (!has.has(`${c.i},${c.j + 1}`)) edges.push({ a: { x: x + h, z: z + h }, b: { x: x - h, z: z + h } })
    if (!has.has(`${c.i - 1},${c.j}`)) edges.push({ a: { x: x - h, z: z + h }, b: { x: x - h, z: z - h } })
  }
  const from = new Map<string, E[]>()
  for (const e of edges) {
    const k = key(e.a)
    from.set(k, [...(from.get(k) ?? []), e])
  }
  const used = new Set<E>()
  const loops: Point[][] = []
  for (const start of edges) {
    if (used.has(start)) continue
    const corners: Point[] = []
    let e = start
    while (!used.has(e)) {
      used.add(e)
      corners.push(e.a)
      const dir = { x: Math.sign(e.b.x - e.a.x), z: Math.sign(e.b.z - e.a.z) }
      const next = (from.get(key(e.b)) ?? []).filter((n) => !used.has(n) || n === start)
      if (!next.length) break
      // At a pinch (two ways on), keep turning the same way round.
      next.sort((p, q) => turn(dir, p) - turn(dir, q))
      e = next[0]
    }
    loops.push(simplify(corners))
  }
  return loops.map((loop) => round(offset(loop, margin), radius))
}

function turn(dir: Point, e: { a: Point; b: Point }) {
  const d = { x: Math.sign(e.b.x - e.a.x), z: Math.sign(e.b.z - e.a.z) }
  // Prefer a left turn, then straight, then right.
  const cross = dir.x * d.z - dir.z * d.x
  return cross > 0 ? 0 : cross === 0 ? 1 : 2
}

// Drop points in the middle of straight runs.
function simplify(pts: Point[]): Point[] {
  return pts.filter((p, n) => {
    const a = pts[(n - 1 + pts.length) % pts.length]
    const c = pts[(n + 1) % pts.length]
    return !((Math.abs(a.x - p.x) < EPS && Math.abs(p.x - c.x) < EPS) || (Math.abs(a.z - p.z) < EPS && Math.abs(p.z - c.z) < EPS))
  })
}

// Push every edge of a right-angled loop outward by m (land on the left).
function offset(pts: Point[], m: number): Point[] {
  const n = pts.length
  return pts.map((p, k) => {
    const a = pts[(k - 1 + n) % n]
    const c = pts[(k + 1) % n]
    const d1 = { x: Math.sign(p.x - a.x), z: Math.sign(p.z - a.z) }
    const d2 = { x: Math.sign(c.x - p.x), z: Math.sign(c.z - p.z) }
    // Outward = right of travel: (dz, −dx).
    return { x: p.x + m * (d1.z + d2.z), z: p.z + m * (-d1.x - d2.x) }
  })
}

// Round each corner with a curve of up to `r` (less on short edges).
function round(pts: Point[], r: number): Point[] {
  const n = pts.length
  const out: Point[] = []
  for (let k = 0; k < n; k++) {
    const a = pts[(k - 1 + n) % n]
    const p = pts[k]
    const c = pts[(k + 1) % n]
    const la = Math.hypot(p.x - a.x, p.z - a.z)
    const lc = Math.hypot(c.x - p.x, c.z - p.z)
    const rr = Math.min(r, la / 2, lc / 2)
    const s = { x: p.x + ((a.x - p.x) / la) * rr, z: p.z + ((a.z - p.z) / la) * rr }
    const e = { x: p.x + ((c.x - p.x) / lc) * rr, z: p.z + ((c.z - p.z) / lc) * rr }
    const STEPS = 6
    for (let t = 0; t <= STEPS; t++) {
      const u = t / STEPS
      out.push({
        x: (1 - u) * (1 - u) * s.x + 2 * (1 - u) * u * p.x + u * u * e.x,
        z: (1 - u) * (1 - u) * s.z + 2 * (1 - u) * u * p.z + u * u * e.z,
      })
    }
  }
  return out
}
