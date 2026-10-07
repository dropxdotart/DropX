// The world is a chain of islands on one shared grid of blocks (BLOCK
// apart, with a road just past each block's front and right side). The
// Houses island is where everyone starts; the City and the Industrial
// island are reached over bridges a player builds. Each island has its own
// themed yard where trucks unload.
//
// Block (i, j) sits at world (i·BLOCK, j·BLOCK). Roads run along the
// lines x = i·BLOCK + 11.5 and z = j·BLOCK + 11.5 (ROAD_Z = 11.5).

export const BLOCK = 23
const R = 11.5 // ROAD_Z: a block's centre to the road in front of it

export type IslandId = 'houses' | 'city' | 'industrial'
export type YardTheme = 'timber' | 'brick' | 'smelter'

export type Island = {
  id: IslandId
  index: number
  name: string
  emoji: string
  i0: number
  i1: number
  j0: number
  j1: number
  // Reached over a bridge the player builds (null: you start here).
  unlock: { level: number; cost: number; buildMinutes: number } | null
  yard: { x: number; z: number; theme: YardTheme; name: string }
}

export const ISLANDS: Island[] = [
  {
    id: 'houses',
    index: 0,
    name: 'Houses island',
    emoji: '🏡',
    i0: -2,
    i1: 2,
    j0: 4,
    j1: 8,
    unlock: null,
    yard: { x: 0, z: 4 * BLOCK, theme: 'timber', name: 'Timber Yard' },
  },
  {
    id: 'city',
    index: 1,
    name: 'City',
    emoji: '🏙️',
    i0: -2,
    i1: 2,
    j0: -2,
    j1: 2,
    unlock: { level: 8, cost: 50_000, buildMinutes: 10 },
    yard: { x: 0, z: -2 * BLOCK, theme: 'brick', name: 'Brick Yard' },
  },
  {
    id: 'industrial',
    index: 2,
    name: 'Industrial island',
    emoji: '🏭',
    i0: -6,
    i1: -4,
    j0: -1,
    j1: 1,
    unlock: { level: 15, cost: 20_000_000, buildMinutes: 60 },
    yard: { x: -5 * BLOCK, z: -1 * BLOCK, theme: 'smelter', name: 'Steel Smelter' },
  },
]

export function island(id: IslandId): Island {
  return ISLANDS.find((s) => s.id === id)!
}

// The harbour district: big lots on a quay off the City's east side.
export const HARBOUR = { i: 3, j0: -1, j1: 1 }
export const HARBOUR_X = HARBOUR.i * BLOCK

// Bridges between islands: the road they carry and the island they open.
export type Bridge = { to: IslandId; axis: 'x' | 'z'; line: number; from: number; until: number }
// On screen "up" is the map's north-west, so each new island sits higher
// up: Houses at the bottom (south), the City above it, Industrial above
// that (west).
export const BRIDGES: Bridge[] = [
  // Houses → City up a cross street.
  { to: 'city', axis: 'x', line: R, from: 2 * BLOCK + R, until: 3 * BLOCK + R },
  // City → Industrial along the road in front of the middle row.
  { to: 'industrial', axis: 'z', line: R, from: -4 * BLOCK + R, until: -3 * BLOCK + R },
]

// ── Road network ─────────────────────────────────────────────────────────

// A straight road: along x at height `line` (z), or along z at `line` (x).
export type Segment = { axis: 'x' | 'z'; line: number; from: number; until: number; bridge?: IslandId; harbour?: boolean; island?: IslandId }

function islandRoads(s: Island): Segment[] {
  const out: Segment[] = []
  const west = (s.i0 - 1) * BLOCK + R
  const east = s.i1 * BLOCK + R
  const north = (s.j0 - 1) * BLOCK + R
  const south = s.j1 * BLOCK + R
  // Front roads of each row (none along the north shore).
  for (let j = s.j0; j <= s.j1; j++) out.push({ axis: 'z', line: j * BLOCK + R, from: west, until: east, island: s.id })
  // Cross streets from the north shore to the south edge.
  for (let i = s.i0 - 1; i <= s.i1; i++) out.push({ axis: 'x', line: i * BLOCK + R, from: north, until: south, island: s.id })
  return out
}

export const ROADS: Segment[] = [
  ...ISLANDS.flatMap(islandRoads),
  // Harbour: the City's middle rows run on out to it, with a street along
  // the far side.
  ...[-2, -1, 0, 1].map((j) => ({
    axis: 'z' as const,
    line: j * BLOCK + R,
    from: 2 * BLOCK + R,
    until: HARBOUR.i * BLOCK + R,
    harbour: true,
    island: 'city' as const,
  })),
  { axis: 'x', line: HARBOUR.i * BLOCK + R, from: -2 * BLOCK + R, until: 1 * BLOCK + R, harbour: true, island: 'city' },
  ...BRIDGES.map((b) => ({ axis: b.axis, line: b.line, from: b.from, until: b.until, bridge: b.to })),
]

export type Point = { x: number; z: number }

// Graph of road junctions: every crossing and every road end.
type Node = Point
const EPS = 0.01
const key = (p: Point) => `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`

function pointsOn(seg: Segment, extra: Point[] = []): Point[] {
  const pts: Point[] = []
  const at = (t: number): Point => (seg.axis === 'z' ? { x: t, z: seg.line } : { x: seg.line, z: t })
  pts.push(at(seg.from), at(seg.until))
  for (const o of ROADS) {
    if (o.axis === seg.axis) continue
    // o crosses seg at (o.line along seg) if within both.
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

function buildGraph(extra: Point[]): Map<string, { p: Node; edges: { to: string; d: number }[] }> {
  const g = new Map<string, { p: Node; edges: { to: string; d: number }[] }>()
  const node = (p: Point) => {
    const k = key(p)
    if (!g.has(k)) g.set(k, { p, edges: [] })
    return k
  }
  for (const seg of ROADS) {
    const pts = pointsOn(seg, extra)
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

// Shortest way along the roads between two road points, as corners.
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

// Which island a world point is on (or null in the water / harbour).
export function islandAt(x: number, z: number): Island | null {
  return (
    ISLANDS.find(
      (s) => x >= (s.i0 - 0.5) * BLOCK - 3 && x <= (s.i1 + 0.5) * BLOCK + 3 && z >= (s.j0 - 0.5) * BLOCK - 3 && z <= (s.j1 + 0.5) * BLOCK + 3
    ) ?? null
  )
}

// An island's land rectangle (edge to edge; the north edge is its beach).
export function islandRect(s: Island) {
  return {
    x0: (s.i0 - 0.5) * BLOCK - 2.7,
    x1: (s.i1 + 0.5) * BLOCK + 2.7 + (s.id === 'city' ? (HARBOUR.i - s.i1) * BLOCK : 0),
    z0: (s.j0 - 0.5) * BLOCK - 1.2,
    z1: (s.j1 + 0.5) * BLOCK + 2.7,
  }
}
