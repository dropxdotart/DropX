import { ROAD_Z, TRUCK_STOP } from './layout'
import { BLOCK, MAP_BLOCKS, PLOT_SLOTS, YARD_BLOCK } from './plots'
import { LOT_HALF } from './layout'

// Truck routing on the city's road grid. Every road runs along a line just
// past a block's front (constant z) or right side (constant x). Vehicles
// keep right: heading +x uses the lane nearer the block (−0.6), heading −x
// the far one (+0.65); on cross streets +z is at −0.65 and −z at +0.65.

// Cross streets (constant x) run the whole map; streets along x (constant
// z) stop at the waterfront, so there's none past the last row of blocks.
export const ROAD_LINES: number[] = []
for (let k = -MAP_BLOCKS - 1; k <= MAP_BLOCKS; k++) ROAD_LINES.push(ROAD_Z + k * BLOCK)
export const ROAD_LINES_Z = ROAD_LINES.filter((z) => z > YARD_BLOCK.z - BLOCK / 2)

export type Point = { x: number; z: number }
// A spot on a front road: `line` is the road's z, `x` how far along.
export type RoadSpot = { x: number; line: number }

export function plotStop(plot: number): RoadSpot {
  const slot = PLOT_SLOTS[plot]
  return { x: slot.x + TRUCK_STOP.x, line: slot.z + ROAD_Z }
}

// The Brick Yard is fenced, with an IN gate and an OUT gate on its front
// (road) side. Trucks turn in at IN, drive to the unload bay, then loop
// across and leave by OUT — one way, so they never meet head-on. Trucks
// with nothing to do park in a row behind the bay. Points are world space.
const YARD_FRONT = YARD_BLOCK.z + LOT_HALF // the fence line facing the road
export const YARD_GATE_IN: RoadSpot = { x: YARD_BLOCK.x - 3, line: YARD_BLOCK.z + ROAD_Z }
export const YARD_GATE_OUT: RoadSpot = { x: YARD_BLOCK.x + 3, line: YARD_BLOCK.z + ROAD_Z }
export const YARD_BAY: Point = { x: YARD_BLOCK.x - 3, z: YARD_FRONT - 4.5 }

// Unloading docks along the bay line (dock 0 is YARD_BAY, with the raised
// hopper; more are bought in the yard). Local x positions.
export const MAX_DOCKS = 4
const DOCK_X = [-3, -0.4, 2.2, 5.4]
export const dockLocalX = (k: number) => DOCK_X[Math.max(0, Math.min(MAX_DOCKS - 1, k))]
export function dockPoint(k: number): Point {
  return { x: YARD_BLOCK.x + dockLocalX(k), z: YARD_BAY.z }
}

// From the IN gate on the road to an unloading dock: straight down to the
// first; to the others, along the drive just inside the front fence.
export function yardEnterPath(dock = 0): Point[] {
  const p = dockPoint(dock)
  const inside = YARD_FRONT - 1
  if (dock === 0) return [{ x: YARD_GATE_IN.x, z: YARD_FRONT + 0.8 }, { x: YARD_GATE_IN.x, z: inside }, p]
  return [{ x: YARD_GATE_IN.x, z: YARD_FRONT + 0.8 }, { x: YARD_GATE_IN.x, z: inside }, { x: p.x, z: inside }, p]
}

// From the bay (or a parking bay) out through the OUT gate onto the road.
export function yardExitPath(from: Point): Point[] {
  return [
    { x: from.x, z: YARD_BAY.z },
    { x: YARD_GATE_OUT.x, z: YARD_BAY.z },
    { x: YARD_GATE_OUT.x, z: YARD_FRONT - 1 },
    { x: YARD_GATE_OUT.x, z: YARD_FRONT + 0.8 },
  ]
}

// ── Yard size and parking ──────────────────────────────────────────────
//
// The yard starts as a small fenced lot with 2 parking bays. Each
// expansion adds 2 bays: the fence first pushes out sideways until the yard
// fills its block, then it grows back over the beach onto a pier in the
// water, a row of bays at a time. Bay positions never move as it grows.
// Local coordinates (relative to YARD_BLOCK): +z faces the road.

export const YARD_MAX_SIZE = 10
export const yardCapacity = (size: number) => 2 * size

// Half the yard's width at each size (it fills the block from size 3).
export function yardHalfWidth(size: number) {
  return size <= 1 ? 6.5 : size === 2 ? 8 : 9.3
}

const BAY_LINE_Z = 3.5 // YARD_BAY's z, local
const LANE_X = -7.6 // the lane down the left side to the back rows
const FRONT_BAYS: Point[] = [
  { x: -5.4, z: -0.5 },
  { x: 0, z: -0.5 },
  { x: 2.6, z: -0.5 },
  { x: 5.2, z: -0.5 },
  { x: 7.8, z: -0.5 },
  { x: 7.8, z: 5 },
]
const BACK_ROW_X = [-4.4, -1.8, 0.8, 3.4, 6]
const backRowZ = (row: number) => -11 - 4.6 * row

// A bay's spot, local to the yard.
export function bayLocal(i: number): Point {
  if (i < FRONT_BAYS.length) return FRONT_BAYS[i]
  const k = i - FRONT_BAYS.length
  return { x: BACK_ROW_X[k % BACK_ROW_X.length], z: backRowZ(Math.floor(k / BACK_ROW_X.length)) }
}

// The fence's back edge (local z): the plant's back wall, or behind the
// last row of bays once the yard has grown onto the pier.
export function yardBackZ(size: number) {
  const extra = yardCapacity(size) - FRONT_BAYS.length
  if (extra <= 0) return -LOT_HALF
  const rows = Math.ceil(extra / BACK_ROW_X.length)
  return backRowZ(rows - 1) - 1.8
}

const world = (p: Point): Point => ({ x: YARD_BLOCK.x + p.x, z: YARD_BLOCK.z + p.z })

export function parkingSpot(i: number): Point {
  return world(bayLocal(i))
}

// The aisle in front of a back-row bay, and the way to it from the bay line.
function backRowAccess(i: number): Point[] {
  const b = bayLocal(i)
  const aisle = b.z + 2.2
  return [world({ x: LANE_X, z: BAY_LINE_Z }), world({ x: LANE_X, z: aisle }), world({ x: b.x, z: aisle })]
}

// From the unload bay into parking bay i.
export function parkPath(i: number): Point[] {
  const spot = parkingSpot(i)
  if (i < FRONT_BAYS.length) return [{ x: spot.x, z: YARD_BAY.z }, spot]
  return [...backRowAccess(i), spot]
}

// From parking bay i back out to the bay line (then yardExitPath or the bay).
export function unparkPath(i: number): Point[] {
  if (i < FRONT_BAYS.length) return []
  return backRowAccess(i).reverse()
}

// Trucks the yard has no room for (an admin can gift more than fit) park
// at the kerb on the road out front, alternating sides of the gates and
// skipping the crossroads.
export function kerbSpot(k: number): RoadSpot {
  const m = Math.floor(k / 2)
  const off = m < 2 ? 6 + 2.6 * m : 15 + 3 * (m - 2)
  return { x: YARD_BLOCK.x + (k % 2 === 0 ? off : -off), line: YARD_BLOCK.z + ROAD_Z }
}

export const KERB_INSET = 1.9 // from the road's centre line toward the yard

// From the near lane onto the kerb, ending parallel to the road.
export function kerbPath(spot: RoadSpot): Point[] {
  const z = spot.line - KERB_INSET
  return [{ x: spot.x - 1.5, z }, { x: spot.x, z }]
}

function laneOffset(from: Point, to: Point): Point {
  if (Math.abs(to.z - from.z) < 0.01) {
    const dz = to.x >= from.x ? -0.6 : 0.65
    return { x: 0, z: dz }
  }
  const dx = to.z >= from.z ? -0.65 : 0.65
  return { x: dx, z: 0 }
}

// Waypoints from one front-road spot to another, in driving lanes: along
// the current road to a cross street, along that, then along the target
// road. The cross street is the one that keeps the trip shortest.
export function planRoute(from: RoadSpot, to: RoadSpot): Point[] {
  const corners: Point[] = [{ x: from.x, z: from.line }]
  if (Math.abs(from.line - to.line) > 0.01) {
    let cross = ROAD_LINES[0]
    let best = Infinity
    for (const v of ROAD_LINES) {
      const cost = Math.abs(from.x - v) + Math.abs(v - to.x) + Math.abs(from.x - v) * 0.001
      if (cost < best) {
        best = cost
        cross = v
      }
    }
    corners.push({ x: cross, z: from.line }, { x: cross, z: to.line })
  }
  corners.push({ x: to.x, z: to.line })

  const out: Point[] = []
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i]
    const b = corners[i + 1]
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.01) continue
    const o = laneOffset(a, b)
    out.push({ x: a.x + o.x, z: a.z + o.z }, { x: b.x + o.x, z: b.z + o.z })
  }
  if (!out.length) out.push({ x: to.x, z: to.line - 0.6 })
  return out
}

export function routeLength(points: Point[], start: Point): number {
  let len = 0
  let prev = start
  for (const p of points) {
    len += Math.hypot(p.x - prev.x, p.z - prev.z)
    prev = p
  }
  return len
}
